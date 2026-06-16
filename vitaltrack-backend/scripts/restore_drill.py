"""Run a pg_dump/pg_restore drill against a disposable target only.

This script intentionally requires explicit confirmation before restoring. It
must never be pointed at production or a long-lived staging database.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, parse_qsl, unquote, urlencode, urlparse


DISPOSABLE_WORDS = ("disposable", "restore-drill", "restore", "drill", "scratch", "test")
TARGET_URL_DISPOSABLE_MARKERS = (
    "disposable",
    "restore-drill",
    "restore_drill",
    "scratch",
)
PROTECTED_TARGET_DATABASES = {
    "neondb",
    "vitaltrack",
    "vitaltrack_staging",
    "vitaltrack_production",
    "carekosh",
    "carekosh_prod",
    "carekosh_production",
}
PROTECTED_TARGET_WORDS = {"prod", "production", "staging", "main", "live"}
PROTECTED_TARGET_HOST_FRAGMENTS = ("vitaltrack-api", "carekosh-prod", "carekosh-production")
# Operators MUST add their real long-lived endpoint hosts here (comma-separated),
# e.g. the production/staging Neon endpoint host fragments. The built-in list above
# cannot know a deployment's actual Neon endpoint, so this is the real prod denylist.
PROTECTED_TARGET_HOST_ENV_VAR = "CAREKOSH_RESTORE_DENY_HOSTS"

# libpq honors connection parameters supplied in the URL query string, and they
# OVERRIDE the host/port/database parsed from the netloc/path. A guard that only
# inspects the netloc/path can therefore be bypassed by smuggling the real target
# into the query (e.g. ...@decoy-scratch.example.com/scratchdb?host=prod&dbname=neondb).
# We fold host/port/dbname into the effective target that the disposable-safety
# checks run against; hostaddr (a raw IP) and service (an opaque external service
# file) name a target we cannot reason about, so any target carrying them is
# rejected outright.
CONNECTION_TARGET_QUERY_KEYS = ("host", "hostaddr", "port", "dbname", "service")
UNVALIDATABLE_QUERY_KEYS = ("hostaddr", "service")
# Query parameters whose values are credentials and must be masked in evidence.
SENSITIVE_QUERY_KEYS = {"password", "sslpassword"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-url",
        default=os.environ.get("CAREKOSH_PGDUMP_SOURCE_URL"),
        help="Source Postgres URL. Defaults to CAREKOSH_PGDUMP_SOURCE_URL.",
    )
    parser.add_argument(
        "--target-url",
        default=os.environ.get("CAREKOSH_RESTORE_TARGET_URL"),
        help="Disposable target Postgres URL. Defaults to CAREKOSH_RESTORE_TARGET_URL.",
    )
    parser.add_argument(
        "--target-description",
        required=True,
        help="Human label for the target branch/project. Must describe a disposable target.",
    )
    parser.add_argument(
        "--confirm-disposable-target",
        action="store_true",
        help="Required for actual restore. Confirms target can be overwritten.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--dump-file", help="Optional dump file path.")
    parser.add_argument("--output", help="Optional JSON evidence output path.")
    return parser.parse_args()


def redact_query(query: str) -> str:
    """Mask credential query params but KEEP connection-target params visible.

    A smuggled ?host=/?dbname= must never be hidden from the evidence trail, so
    only password-bearing parameters are redacted; host, dbname, port, sslmode,
    etc. are surfaced verbatim so the audit log shows the real connection target.
    """
    if not query:
        return ""
    pairs = parse_qsl(query, keep_blank_values=True)
    redacted = [
        (key, "<redacted>" if key.lower() in SENSITIVE_QUERY_KEYS else value)
        for key, value in pairs
    ]
    return urlencode(redacted)


def redact_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return "<invalid-url>"
    host = parsed.hostname or "<unknown-host>"
    # A multi-host (libpq failover) netloc with an explicit port makes
    # parsed.port raise ValueError. Evidence logging must never crash on it.
    try:
        port = f":{parsed.port}" if parsed.port else ""
    except ValueError:
        port = ""
    database = parsed.path or ""
    # Surface the query string (credentials masked) so a ?host=/?dbname= override
    # smuggled past the netloc cannot be hidden from the redacted command log.
    query = redact_query(parsed.query)
    suffix = f"?{query}" if query else ""
    return f"{parsed.scheme}://<redacted>@{host}{port}{database}{suffix}"


def validate_url_pair(source_url: str | None, target_url: str | None) -> list[str]:
    errors: list[str] = []
    if not source_url:
        errors.append("source URL is required")
    if not target_url:
        errors.append("target URL is required")
    if source_url and target_url and source_url == target_url:
        errors.append("source and target URLs must not be identical")
    for label, value in (("source", source_url), ("target", target_url)):
        if value:
            parsed = urlparse(value)
            if parsed.scheme not in {"postgres", "postgresql"}:
                errors.append(f"{label} URL must be a postgres/postgresql URL")
            if not parsed.hostname or not parsed.path.strip("/"):
                errors.append(f"{label} URL must include host and database name")
    if target_url:
        unvalidatable_keys = target_query_override_keys(target_url)
        if unvalidatable_keys:
            keys = ", ".join(sorted(unvalidatable_keys))
            errors.append(
                "target URL query string contains connection parameter(s) that "
                f"override the connection target and cannot be validated: {keys}. "
                "Remove them and point the URL host/database directly at the "
                "disposable target."
            )
        if target_url_is_multi_host(target_url):
            errors.append(
                "target URL must list exactly one host: a comma-separated "
                "(libpq failover) host list can hide a protected host behind a "
                "disposable-looking decoy, so multi-host targets are rejected"
            )
        protected_reason = target_url_protection_reason(target_url)
        if protected_reason:
            errors.append(f"target URL is not disposable-safe: {protected_reason}")
        if not target_url_has_disposable_marker(target_url):
            errors.append(
                "target URL must include a strong disposable marker in the host "
                "or database name (not the username): disposable, restore-drill, "
                "restore_drill, or scratch"
            )
    return errors


def validate_disposable_description(description: str) -> bool:
    normalized = description.lower()
    return any(word in normalized for word in DISPOSABLE_WORDS)


def target_query_params(url: str) -> dict[str, list[str]]:
    """Parse the URL query string into a case-normalized {key: [values]} map.

    libpq connection keywords are lowercase; keys are normalized to lowercase so
    a query like ?Host= cannot dodge the override checks on a case technicality.
    """
    normalized: dict[str, list[str]] = {}
    for key, values in parse_qs(urlparse(url).query, keep_blank_values=True).items():
        normalized.setdefault(key.lower(), []).extend(values)
    return normalized


def target_query_override_keys(url: str) -> list[str]:
    """Query keys that retarget the connection but cannot be safely validated."""
    params = target_query_params(url)
    return [key for key in UNVALIDATABLE_QUERY_KEYS if key in params]


def _strip_port(host: str) -> str:
    host = host.strip()
    if host.startswith("[") and "]" in host:  # [IPv6]:port
        return host[1 : host.index("]")]
    if ":" in host:
        return host.rsplit(":", 1)[0]
    return host


def effective_target_hosts(url: str) -> list[str]:
    """Hostnames libpq will actually connect to (lowercased, port stripped).

    A ?host= query parameter overrides the netloc host entirely and may itself be
    comma-separated (libpq failover) or repeated, so it is expanded into the full
    host list. Falls back to the netloc host(s) when no override is present.
    """
    params = target_query_params(url)
    if "host" in params:
        raw_hosts: list[str] = []
        for value in params["host"]:
            raw_hosts.extend(value.split(","))
    else:
        netloc = urlparse(url).netloc
        if "@" in netloc:
            netloc = netloc.rsplit("@", 1)[1]
        raw_hosts = netloc.split(",")
    hosts = [_strip_port(host).lower() for host in raw_hosts]
    return [host for host in hosts if host]


def effective_target_ports(url: str) -> list[str]:
    """Ports from a ?port= override, expanded across any comma-separated list."""
    params = target_query_params(url)
    ports: list[str] = []
    for value in params.get("port", []):
        ports.extend(part.strip() for part in value.split(",") if part.strip())
    return ports


def effective_target_database(url: str) -> str:
    """Database libpq will connect to: ?dbname= overrides the URL path."""
    params = target_query_params(url)
    if params.get("dbname"):
        # parse_qs already percent-decodes the value.
        return params["dbname"][-1].strip().strip("/").lower()
    return unquote(urlparse(url).path.strip("/")).lower()


def target_url_is_multi_host(url: str) -> bool:
    # More than one effective host, or a comma-separated ?port= list (which libpq
    # only meaningfully pairs with a multi-host connection), is failover routing
    # that can hide a protected host behind a disposable-looking decoy.
    return len(effective_target_hosts(url)) > 1 or len(effective_target_ports(url)) > 1


def protected_target_host_fragments() -> tuple[str, ...]:
    configured = os.environ.get(PROTECTED_TARGET_HOST_ENV_VAR, "")
    extra = tuple(
        fragment.strip().lower()
        for fragment in configured.split(",")
        if fragment.strip()
    )
    return PROTECTED_TARGET_HOST_FRAGMENTS + extra


def target_url_has_disposable_marker(url: str) -> bool:
    # Deliberately ignores the username: a disposable-looking username label
    # alone must not unlock a restore against a protected host/database. Uses the
    # EFFECTIVE host(s) and database so a ?host=/?dbname= override that changes
    # the real connection target is inspected, not just the URI surface (where a
    # decoy marker could otherwise hide the smuggled prod host).
    hosts = effective_target_hosts(url)
    database = effective_target_database(url)
    target_text = " ".join(filter(None, (*hosts, database))).lower()
    return any(marker in target_text for marker in TARGET_URL_DISPOSABLE_MARKERS)


def target_url_protection_reason(url: str) -> str | None:
    hosts = effective_target_hosts(url)
    database = effective_target_database(url)

    if database in PROTECTED_TARGET_DATABASES:
        return f"database name {database!r} is reserved for long-lived environments"

    normalized_database_words = set(database.replace("-", "_").split("_"))
    protected_database_words = normalized_database_words & PROTECTED_TARGET_WORDS
    if protected_database_words:
        words = ", ".join(sorted(protected_database_words))
        return f"database name contains protected environment word(s): {words}"

    for hostname in hosts:
        host_words = set(hostname.replace("-", ".").replace("_", ".").split("."))
        protected_host_words = host_words & PROTECTED_TARGET_WORDS
        if protected_host_words:
            words = ", ".join(sorted(protected_host_words))
            return f"host contains protected environment word(s): {words}"

        host_fragment = next(
            (fragment for fragment in protected_target_host_fragments() if fragment in hostname),
            None,
        )
        if host_fragment:
            return f"host contains protected fragment {host_fragment!r}"

    return None


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"Required tool not found on PATH: {name}")
    return path


def run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def command_for_log(command: list[str], source_url: str, target_url: str) -> list[str]:
    redacted = []
    for part in command:
        if part == source_url:
            redacted.append(redact_url(source_url))
        elif part == target_url:
            redacted.append(redact_url(target_url))
        else:
            redacted.append(part)
    return redacted


def write_output(path: str, payload: dict[str, Any]) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def main() -> int:
    args = parse_args()
    errors = validate_url_pair(args.source_url, args.target_url)
    if not validate_disposable_description(args.target_description):
        errors.append(
            "--target-description must include a disposable target word such as "
            "restore-drill, disposable, scratch, or test"
        )
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 2

    source_url = str(args.source_url)
    target_url = str(args.target_url)
    if not args.dry_run and not args.confirm_disposable_target:
        print(
            "Refusing actual restore without --confirm-disposable-target.",
            file=sys.stderr,
        )
        return 2

    try:
        pg_dump = require_tool("pg_dump")
        pg_restore = require_tool("pg_restore")
        psql = require_tool("psql")
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    dump_file = args.dump_file or str(
        Path(tempfile.gettempdir())
        / f"carekosh-restore-drill-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.dump"
    )
    commands = {
        "dump": [
            pg_dump,
            "-Fc",
            "--no-owner",
            "--no-acl",
            "-d",
            source_url,
            "-f",
            dump_file,
        ],
        "restore": [
            pg_restore,
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-acl",
            "-d",
            target_url,
            dump_file,
        ],
        "verify": [
            psql,
            target_url,
            "-v",
            "ON_ERROR_STOP=1",
            "-Atc",
            "select count(*) from information_schema.tables where table_schema='public';",
        ],
    }

    evidence: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": bool(args.dry_run),
        "target_description": args.target_description,
        "source_url": redact_url(source_url),
        "target_url": redact_url(target_url),
        "dump_file": dump_file,
        "commands": {
            key: command_for_log(command, source_url, target_url)
            for key, command in commands.items()
        },
        "steps": [],
    }

    if args.dry_run:
        evidence["ok"] = True
        print(json.dumps(evidence, indent=2, sort_keys=True))
        if args.output:
            write_output(args.output, evidence)
        return 0

    for name in ("dump", "restore", "verify"):
        completed = run_command(commands[name])
        evidence["steps"].append(
            {
                "name": name,
                "returncode": completed.returncode,
                "stdout_tail": completed.stdout[-500:],
                "stderr_tail": completed.stderr[-500:],
            }
        )
        if completed.returncode != 0:
            evidence["ok"] = False
            print(json.dumps(evidence, indent=2, sort_keys=True))
            if args.output:
                write_output(args.output, evidence)
            return completed.returncode

    evidence["ok"] = True
    print(json.dumps(evidence, indent=2, sort_keys=True))
    if args.output:
        write_output(args.output, evidence)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

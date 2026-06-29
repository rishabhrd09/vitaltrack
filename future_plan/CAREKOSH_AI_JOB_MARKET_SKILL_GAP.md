# CareKosh — AI Job-Market Skill-Gap Analysis (2026)

> **Goal:** map the most-demanded skills in remote-India Generative-AI / LLM / Python-AI-backend
> roles (>₹20 LPA, mid-senior) against the CareKosh project — what's covered, what's a gap, and
> what's worth building next on a free/solo stack.
>
> **Methodology note:** the percentages are **evidence-based estimates** from surveyed listings +
> 2026 India market reports (not a strict count of a fixed sample). Each item is classified
> **must-have** (in most JDs) vs **nice-to-have** (occasional) — the decision-useful part.
> Listings are time-sensitive; verify before applying.

---

## B · Top-10 most-demanded (composite — start here)

1. **Python** — universal (~95%+)
2. **RAG** (retrieval-augmented generation) — the #1 Gen-AI concept
3. **LLM APIs + prompt engineering** (OpenAI / Anthropic / Gemini)
4. **LangChain** (+ rising **LangGraph**) — dominant named framework
5. **Vector DBs + embeddings + semantic search** (Pinecone / FAISS / pgvector)
6. **Agentic AI / tool-calling / multi-agent** — fastest-growing (+300% YoY)
7. **FastAPI + REST / microservices**
8. **Production deployment + LLMOps / evals** ("ship safely, keep it alive")
9. **Cloud (AWS/GCP/Azure) + Docker**
10. **SQL / Postgres** + rising **MLOps (MLflow)**

> The 2026 market shifted from "can you build a model?" to **"can you ship AI safely, at scale,
> and keep it alive in production?"** — which is exactly CareKosh's strength.

---

## A · Frequency by bucket (must-have vs nice-to-have)

**Language + backend**
| Item | Demand |
|---|---|
| Python | must (~95%) |
| FastAPI | must (~70% of AI-backend roles) |
| REST / microservices | must |
| Docker | must |
| Cloud (AWS/GCP/Azure) | must |
| SQL / NoSQL | must |
| async, CI/CD | common |
| Kubernetes | nice (senior / MLOps) |
| Flask / Django | occasional (FastAPI now dominant) |
| gRPC / Celery / Kafka / Redis | role-specific |

**Gen-AI concepts**
| Item | Demand |
|---|---|
| RAG | must (~80%) |
| Agentic / tool-calling / multi-agent | must & rising (+300% YoY) |
| Embeddings + semantic search | must |
| Prompt engineering | must |
| LLMOps / evals | must (~60%) |
| Function-calling, guardrails/safety | common, rising |
| Fine-tuning / LoRA / PEFT | nice (listed more than used) |
| **MCP (Model Context Protocol)** | emerging (~10–20%, rising fast) |
| Streaming / structured output / context engineering | occasional, rising |

**Frameworks** — LangChain `must (~70%)` · LangGraph `rising (~35%)` · LlamaIndex `common ("LangChain or LlamaIndex")` · CrewAI / AutoGen `rising (agentic)` · Haystack / DSPy / Semantic Kernel / Pydantic-AI `niche`

**Vector DB** — "vector DB" generic `must` · Pinecone `most-named` · FAISS `common` · Chroma / Weaviate / Qdrant / Milvus `occasional` · **pgvector `occasional but growing`**

**LLM providers** — OpenAI/GPT `must` · Claude `common` · Gemini / Llama / Mistral `common` · Bedrock / Azure-OpenAI / Vertex `enterprise` · **Groq / Ollama `occasional (cost-conscious)`**

**Observability / eval** — LangSmith / Langfuse `rising (~30%)` · Ragas / DeepEval `occasional` · W&B / Arize `ML-heavy`

**Data / MLOps** — pandas / numpy `must for ML roles` · MLflow `common` · Airflow / Kafka / Spark `data-eng-adjacent`

---

## C · Gap table — CareKosh status

| Demanded skill | CareKosh | Smallest free/solo step |
|---|---|---|
| Python · FastAPI · REST | ✅ shipped | — |
| SQL / Postgres | ✅ Neon | — |
| Docker + deployed-in-prod | ✅ Render/Docker | — |
| RAG | 🟡 planned | pgvector + embed item text (V2.1) |
| LLM APIs + prompt eng | 🟡 planned | Groq/Gemini free tier (V2.0) |
| **LangChain / LangGraph** | 🟡 planned | build the agent *on LangGraph* (V2.0) |
| Vector DB + embeddings | 🟡 planned | enable pgvector + e5-small (V2.1) |
| Agentic / tool-calling | 🟡 planned | the V2.0 MVP agent |
| LLMOps / evals | 🟡 partial | app deployed ✅; add **Langfuse + Ragas** |
| **MCP** | 🟡 planned | expose tools as an MCP server (V2.1) — differentiator |
| Cloud big-3 (AWS/GCP/Azure) | 🔴 gap | optional; Render+Neon deploy proves the concept |
| Fine-tuning / LoRA | 🔴 gap | **skip & talk** — know why RAG beats it here |
| Kubernetes / MLOps-heavy | 🔴 gap | **skip** — overkill for solo |
| pandas / numpy / MLflow | 🔴 gap | skip unless a role is ML-heavy |

**Verdict:** the shipped/backend half is ✅ today; the entire Gen-AI half is 🟡 *planned* (all buildable on the free stack). The only true 🔴 gaps are things to **deliberately skip** (fine-tuning, K8s, heavy MLOps).

---

## D · Cover-next (high ROI) vs skip

**Build (high-demand × low-effort × free):**
1. **Agentic tool-calling agent on LangGraph** (Groq/Gemini free) — hits RAG + agentic + LangChain + LLM APIs at once.
2. **pgvector semantic search + embeddings** — vector-DB keyword, no new infra.
3. **MCP server** — rare, current, low effort = outsized signal.
4. **Langfuse tracing + Ragas evals** — turns "LLMOps" from claim into artifact.
5. **Prompt engineering + structured output + guardrails** (already in the design).
6. **Token streaming** — small, production-AI signal.

**Skip / deprioritize** (high effort or low relevance for a solo, free, GPU-less stack):
- Large-scale fine-tuning / LoRA / PEFT (RAG is the right choice; just be able to *discuss* it)
- Kubernetes · distributed training
- Heavy MLOps (Airflow / Kafka / Spark)
- Big-3 cloud certs (nice, not gating)

---

## E · Résumé-keyword checklist (truthfully claimable)

- **After V2.0:** Python · FastAPI · RAG · LLM tool-calling · **LangChain/LangGraph** · vector DB (pgvector) · embeddings/semantic search · agentic AI · prompt engineering · guardrails · production deployment · **Langfuse (LLMOps)**.
- **After V2.1:** + **MCP server** · **Ragas evals** · multilingual (Hindi-English) · streaming · multi-agent (if the CrewAI demo is added).

---

## F · Honest caveats

- **What GATES hiring (pass regardless of the project):** DSA/coding rounds, system design, databases, distributed-systems fundamentals. The AI project **does not replace** them — keep DSA at ~45–55% of prep time.
- **What DIFFERENTIATES (wins the room):** a *deployed, production* agentic system + **medical-grade guardrails** + the "ship & keep alive" story. Most applicants only have a notebook RAG demo.
- **Recruiter-bait vs real:** "fine-tuning" and "multi-agent" are *listed* far more than they're *used day-to-day*. Real production GenAI work is overwhelmingly **RAG + prompting + tool-calling agents + vector search** — which is precisely the plan. Don't panic over every keyword; nail the **core six** (Python, FastAPI, RAG, LangChain/LangGraph, vector DB, agentic) + production.

---

## Sources
- [BuildFastWithAI — AI Jobs India Salary 2026](https://www.buildfastwithai.com/blogs/ai-jobs-india-salary-2026)
- [Taggd — AI Engineer roles/skills/salary 2026](https://taggd.in/blogs/ai-engineer/)
- [Futurense — AI skills in demand 2026](https://futurense.com/blog/ai-skills-in-demand)
- [HuntingCube — ML & GenAI Engineer jobs India 2026](https://blog.huntingcube.ai/machine-learning-generative-ai-engineer-jobs-india-2026/)
- [Tredence — GenAI/LLM engineer careers](https://www.tredence.com/blog/generative-ai-llm-engineer-careers-2025)
- [Cambridge Infotech — agentic AI career (300% growth)](https://cambridgeinfotech.io/agentic-ai-career-in-india/)
- Listings (time-sensitive): [Joveo LLM Engineer](https://in.linkedin.com/jobs/view/llm-engineer-remote-at-joveo-ai-4404314000) · [Codvo RAG + Agentic](https://in.linkedin.com/jobs/view/rag-+-agentic-ai-engineer-india-remote-at-codvo-ai-4324072259) · [Sarvam careers](https://www.sarvam.ai/careers)

---

*Companion to `future_plan/CAREKOSH_AI_FEATURES_FEASIBILITY_AND_ROADMAP.html` (§10 Job-market alignment). Forward-looking (V2+); the first Play Store release ships foundation-only.*

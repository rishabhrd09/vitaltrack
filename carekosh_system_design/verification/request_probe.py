"""Documentation probes: no DB connection and no real provider calls."""
import asyncio
import json
import os
import secrets
from types import SimpleNamespace

os.environ.update(ENVIRONMENT='testing', SECRET_KEY=secrets.token_hex(32),
    DATABASE_URL='postgresql+asyncpg://unused:unused@127.0.0.1:1/documentation_test',
    MAIL_PASSWORD='', GROQ_API_KEY='', SARVAM_API_KEY='', SENTRY_DSN='',
    AI_ENABLED='false', AI_TRANSCRIBE_ENABLED='false', AI_SPEECH_ENABLED='false')

from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.database import get_db
from app.core.security import create_access_token
from app.models import User
from sqlalchemy import inspect

events=[]
user=SimpleNamespace(id='synthetic-user',session_version=0,is_active=True,
                     email='synthetic@example.com',is_email_verified=True)

class FakeSession:
    async def execute(self, statement):
        events.append('auth SELECT (fake; no database)')
        return SimpleNamespace(scalar_one_or_none=lambda: user)

async def fake_db():
    events.append('session dependency entered')
    try: yield FakeSession()
    finally: events.append('session dependency exited')

async def run():
    app.dependency_overrides[get_db]=fake_db
    token=create_access_token(user.id,additional_claims={'session_version':0})
    results=[]
    try:
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://local.test') as client:
            for name,body,bearer,expected,lookup in [
                ('schema-invalid body with valid access token','{"quantity":-1,"version":1}',token,422,True),
                ('schema-invalid body with bad token','{"quantity":-1,"version":1}','invalid',401,False),
                ('malformed JSON with valid token','{',token,422,False),
            ]:
                events.clear()
                response=await client.put('/api/v1/items/synthetic-item',content=body,
                    headers={'Authorization':f'Bearer {bearer}','Content-Type':'application/json'})
                assert response.status_code==expected,(name,response.status_code)
                assert any(x.startswith('auth SELECT') for x in events)==lookup,(name,events)
                results.append({'case':name,'status':response.status_code,'events':list(events)})
    finally: app.dependency_overrides.pop(get_db,None)
    routes=[(r.path,sorted(r.methods)) for r in app.routes if hasattr(r,'methods') and not r.path.startswith(('/docs','/redoc','/openapi'))]
    assert len(routes)==50,len(routes)
    assert sum(p.startswith('/api/v1/') for p,_ in routes)==44
    # Register all tables, then examine actual FK targets without opening a connection.
    from app.core.database import Base
    from app.models import AIConsent, AIUsage, OrderNumberCounter
    assert len(Base.metadata.tables)==11
    fks={name:[{'column':fk.parent.name,'target':fk.target_fullname,'ondelete':fk.ondelete}
               for fk in t.foreign_keys] for name,t in sorted(Base.metadata.tables.items())}
    assert fks['order_items']==[{'column':'order_id','target':'orders.id','ondelete':'CASCADE'}]
    assert not fks['order_number_counters']
    print(json.dumps({'validation_probes':results,'api_operations':len(routes),'versioned_operations':44,
                     'application_tables':len(Base.metadata.tables),'foreign_keys':fks},indent=2))
    from app.core.database import engine
    await engine.dispose()

asyncio.run(run())

from fastapi import APIRouter

from .routes import ai, auth, categories, documents, health, tickets, users

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(categories.router)
api_router.include_router(tickets.router)
api_router.include_router(documents.router)
api_router.include_router(ai.router)

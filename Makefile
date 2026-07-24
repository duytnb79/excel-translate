.DEFAULT_GOAL := help

PROJECT_ID ?= vi-translate
REGION ?= asia-southeast1
CLOUD_RUN_SERVICE ?= sheets-translate-api
GEMINI_SECRET ?= gemini-api-key
AI_ACCESS_SECRET ?= ai-access-key
AI_DEFAULT_MODEL ?= gemini-3.5-flash-lite
AI_ALLOWED_MODELS ?= gemini-3.6-flash,gemini-3.5-flash-lite
DAILY_REQUEST_LIMIT ?= 100
DAILY_TOKEN_LIMIT ?= 1000000
FIREBASE := npx firebase --project $(PROJECT_ID)
GCLOUD := gcloud --project $(PROJECT_ID)

.PHONY: help install backend-install lint build backend-build backend-check deploy deploy-hosting deploy-backend deploy-be deploy-fe firebase-login

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install frontend and backend dependencies
	npm install
	npm install --prefix backend

backend-install: ## Install backend dependencies
	npm install --prefix backend

lint: ## Run lint checks
	npm run lint

build: ## Build frontend
	npm run build

backend-check: ## Type-check backend
	npm run typecheck --prefix backend

backend-build: ## Build backend
	npm run build --prefix backend

deploy-backend: backend-build ## Deploy API to Cloud Run using Gemini secret
	$(GCLOUD) run deploy $(CLOUD_RUN_SERVICE) \
		--source backend \
		--region $(REGION) \
		--allow-unauthenticated \
		--set-secrets GEMINI_API_KEY=$(GEMINI_SECRET):latest,AI_ACCESS_KEY=$(AI_ACCESS_SECRET):latest \
		--set-env-vars '^@^GOOGLE_CLOUD_PROJECT=$(PROJECT_ID)@AI_DEFAULT_MODEL=$(AI_DEFAULT_MODEL)@AI_ALLOWED_MODELS=$(AI_ALLOWED_MODELS)@DAILY_REQUEST_LIMIT=$(DAILY_REQUEST_LIMIT)@DAILY_TOKEN_LIMIT=$(DAILY_TOKEN_LIMIT)'

deploy-be: deploy-backend ## Deploy API to Cloud Run (shortcut)

deploy-hosting: build ## Deploy frontend hosting to Firebase
	$(FIREBASE) deploy --only hosting

deploy-fe: deploy-hosting ## Deploy frontend hosting to Firebase (shortcut)

deploy: deploy-backend deploy-hosting ## Deploy Cloud Run API and Firebase Hosting

firebase-login: ## Login to Firebase CLI
	npx firebase login

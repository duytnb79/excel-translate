.DEFAULT_GOAL := help

PROJECT_ID ?= vi-translate
FIREBASE := npx firebase --project $(PROJECT_ID)

.PHONY: help install lint build deploy firebase-login

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install project dependencies
	npm install

lint: ## Run lint checks
	npm run lint

build: ## Build frontend
	npm run build

deploy: build ## Deploy frontend hosting to Firebase
	$(FIREBASE) deploy --only hosting

firebase-login: ## Login to Firebase CLI
	npx firebase login

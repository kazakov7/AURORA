#!/bin/bash

# Define paths
APP_DIR="/Users/dadakhonovich/Desktop/AURORA"
OUT_FILE="/Users/dadakhonovich/.gemini/antigravity/brain/440ea534-ef35-4c2b-bc33-14a2c087a9f5/scratch/audit_backend_arch.md"

cd $APP_DIR

echo "# AURORA Backend Deep Audit: Phases 1.1 & 1.2" > $OUT_FILE
echo "" >> $OUT_FILE

echo "## PHASE 1.1 — Architecture and Project Structure" >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 1. Dependencies and Versions" >> $OUT_FILE
echo '```json' >> $OUT_FILE
cat package.json | grep -A 100 '"dependencies": {' | awk '/"devDependencies": \{/{exit} {print}' >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 2. TypeScript Configuration" >> $OUT_FILE
echo "#### tsconfig.json" >> $OUT_FILE
echo '```json' >> $OUT_FILE
cat tsconfig.json >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "#### tsconfig.build.json" >> $OUT_FILE
echo '```json' >> $OUT_FILE
cat tsconfig.build.json >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 3. Nest CLI Configuration" >> $OUT_FILE
echo '```json' >> $OUT_FILE
cat nest-cli.json >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 4. Apps Directory Structure" >> $OUT_FILE
echo '```text' >> $OUT_FILE
find apps/ -type f >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 5. Main Bootstrap File (main.ts)" >> $OUT_FILE
echo '```typescript' >> $OUT_FILE
cat apps/aurora-api/src/main.ts >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 6. AppModule" >> $OUT_FILE
echo '```typescript' >> $OUT_FILE
cat apps/aurora-api/src/app.module.ts >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 7. Feature Modules" >> $OUT_FILE
echo '```text' >> $OUT_FILE
find apps/ -name "*.module.ts" >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 8. Resolvers, Services, Schemas, DTOs" >> $OUT_FILE
echo '```text' >> $OUT_FILE
find apps/ -type f | grep -E "(resolver|service|schema|dto)\.ts" >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 9. Guards, Decorators, Pipes, Interceptors, Exception Filters" >> $OUT_FILE
echo '```text' >> $OUT_FILE
find apps/ -type f | grep -E "(guard|decorator|pipe|interceptor|filter)\.ts" >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 10. Environment Variables Configuration" >> $OUT_FILE
echo '```text' >> $OUT_FILE
cat .env 2>/dev/null || echo "No .env file found" >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 11. TypeScript Validation (tsc --noEmit)" >> $OUT_FILE
echo '```text' >> $OUT_FILE
npx tsc --noEmit 2>&1 | head -n 100 >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 12. Build Output" >> $OUT_FILE
echo '```text' >> $OUT_FILE
npm run build 2>&1 | tail -n 50 >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 13. Circular Dependencies" >> $OUT_FILE
echo '```text' >> $OUT_FILE
npx madge --circular apps/aurora-api/src/main.ts 2>/dev/null || echo "Madge not installed or failed" >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 14. Use of 'any' Type" >> $OUT_FILE
echo '```text' >> $OUT_FILE
grep -rn ': any' apps/ >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 15. Unhandled Async Operations" >> $OUT_FILE
echo '```text' >> $OUT_FILE
grep -rn 'async ' apps/ | grep -v 'await' | head -30 >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE


echo "## PHASE 1.2 — Complete API Inventory" >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 1. ALL Resolvers" >> $OUT_FILE
echo '```text' >> $OUT_FILE
grep -rn '@Query\|@Mutation\|@Subscription' apps/ >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 2. GraphQL Enums" >> $OUT_FILE
echo '```text' >> $OUT_FILE
grep -rn 'registerEnumType' apps/ >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 3. Input Types" >> $OUT_FILE
echo '```text' >> $OUT_FILE
grep -rn '@InputType' apps/ >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 4. Object Types" >> $OUT_FILE
echo '```text' >> $OUT_FILE
grep -rn '@ObjectType' apps/ >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 5. REST Endpoints" >> $OUT_FILE
echo '```text' >> $OUT_FILE
grep -rn '@Get\|@Post\|@Put\|@Delete\|@Patch' apps/ >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "### 6. Safe GraphQL Queries & Introspection" >> $OUT_FILE
echo '```json' >> $OUT_FILE
curl -s -X POST -H 'Content-Type: application/json' -d '{"query": "{ __schema { queryType { fields { name } } mutationType { fields { name } } } }"}' http://localhost:3007/graphql >> $OUT_FILE
echo '```' >> $OUT_FILE
echo "" >> $OUT_FILE

echo "Audit generated successfully."

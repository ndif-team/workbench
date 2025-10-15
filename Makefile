build_base:
	docker build --no-cache -t workbench_base:latest -f docker/dockerfile.base .

build_uv:
	docker build --no-cache -t workbench_uv:latest -f docker/dockerfile.uv .

build_service:
	docker build --no-cache -t workbench:latest -f docker/dockerfile.service .

build: build_base build_uv build_service

# Docker commands
up:
	docker run -d --name workbench-api -p 8000:8000 workbench:latest

down:
	docker stop workbench-api
	docker rm workbench-api

make ta:
	make down
	make build_service
	make up

logs:
	docker logs -f workbench-api

clean:
	docker stop workbench-api 2>/dev/null || true
	docker rm workbench-api 2>/dev/null || true
	docker system prune -f

modal:
	modal deploy modal/image.py


# TESTING

lens-local: 
	k6 run -e BACKEND_URL=http://localhost:8000 workbench/_web/tests/k6/lens.ts

lens-modal: 
	k6 run -e BACKEND_URL=https://ndif--interp-workbench-modal-app.modal.run workbench/_web/tests/k6/lens.ts
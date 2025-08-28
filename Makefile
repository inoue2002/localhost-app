PORT ?= 3000

.PHONY: start dev ip

start:
	@echo "Starting server on 0.0.0.0:$(PORT)"
	@PORT=$(PORT) node server.js

dev: start

ip:
	@echo "Local IPs:"
	@ipconfig getifaddr en0 2>/dev/null || true
	@ipconfig getifaddr en1 2>/dev/null || true
	@ipconfig getifaddr en2 2>/dev/null || true


build:
	cargo build --target wasm32v1-none --release

test:
	cargo test --workspace

fmt:
	cargo fmt --all

lint:
	cargo clippy --workspace -- -D warnings

deploy:
	stellar contract deploy \
		--wasm target/wasm32v1-none/release/*.wasm \
		--source $(STELLAR_SECRET_KEY) \
		--network testnet

.PHONY: build test fmt lint deploy

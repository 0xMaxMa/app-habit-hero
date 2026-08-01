.PHONY: help agent-msg

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

agent-msg: ## Send a message to the agent  usage: make agent-msg msg="Hello"
	bash agent-msg.sh "$(msg)"

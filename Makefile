# Define variables for easier updates
TEST_DIR := test-site
THEME_NAME := dhruv-archives-theme

# Target to setup the test environment
setup-test:
	@echo "Setting up test environment..."
	@mkdir -p $(TEST_DIR)/{archetypes,content,layouts,static,themes}
	@cp -r . $(TEST_DIR)/themes/$(THEME_NAME)
	@cd $(TEST_DIR) && \
	echo "theme = \"$(THEME_NAME)\"\nbaseURL = \"http://example.org/\"\nlanguageCode = \"en-us\"\ntitle = \"Theme Font Test\"\n\n[params]\n  google_fonts = [\n    [\"Jersey 25\", \"400,700\"],\n    [\"Roboto\", \"400,700\"]\n  ]" > config.toml
	@echo "---" > $(TEST_DIR)/content/font-test.md
	@echo "title: \"Font Test\"" >> $(TEST_DIR)/content/font-test.md
	@echo "date: 2023-01-01" >> $(TEST_DIR)/content/font-test.md
	@echo "---" >> $(TEST_DIR)/content/font-test.md
	@echo "\n# This is a Heading\nHere's some body text to test the font." >> $(TEST_DIR)/content/font-test.md
	@echo "Test environment setup completed."

# Target to run the Hugo server for testing
test:
	@echo "Starting Hugo server for testing..."
	@cd $(TEST_DIR) && hugo server -D

# Target to clean up the test environment
clean-test:
	@echo "Cleaning up test environment..."
	@rm -rf $(TEST_DIR)
	@echo "Test environment cleaned."

# Default target
.PHONY: all
all: clean-test setup-test test

# Help information
help:
	@echo "Usage: make [target]"
	@echo "Targets:"
	@echo "  setup-test  - Set up a test environment"
	@echo "  test        - Run Hugo server to test the theme"
	@echo "  clean-test  - Clean up the test environment"
	@echo "  all         - Setup test environment and start Hugo server"
	@echo "  help        - Show this help message"
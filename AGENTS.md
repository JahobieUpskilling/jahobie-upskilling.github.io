# General Working Instructions

## Working approach

* Read the relevant existing files before making changes.
* Make reasonable assumptions when the task is clear.
* Ask a question only when missing information would materially affect the result.
* Prefer the smallest complete solution over unnecessary complexity.
* Follow the repository’s existing structure and conventions.
* Avoid unrelated refactoring.

## Dependencies

* Prefer existing dependencies and platform features.
* Add a dependency only when it provides a clear practical benefit.
* Explain any significant new dependency.

## Quality

* Keep code readable, maintainable, and appropriately documented.
* Handle obvious errors and edge cases.
* Preserve accessibility and responsive behavior when working on user interfaces.
* Avoid placeholder content unless explicitly requested.

## Verification

* Run relevant tests, linting, type checking, and build commands after making changes.
* Test the primary user-facing behavior directly when practical.
* Check for console, build, and runtime errors.
* Do not claim something works unless it was verified.
* Clearly report anything that could not be tested.

## Security and privacy

* Never expose, print, or commit secrets, credentials, private keys, or personal access tokens.
* Do not include sensitive or personally identifiable information in logs or analytics.
* Review configuration and staged changes for accidental secrets before committing.

## Git practices

* Preserve existing user changes.
* Review the final diff before committing.
* Keep commits focused and use clear commit messages.
* Confirm the repository and remote before pushing.
* Do not force-push, delete branches, or perform destructive Git operations unless explicitly requested.

## Communication

* Lead with outcomes and important blockers.
* Keep progress updates concise.
* Explain material assumptions and tradeoffs.
* At completion, summarize changes, verification performed, and any remaining limitations.

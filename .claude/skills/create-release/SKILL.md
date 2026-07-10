---
name: release-process
description: "Use when: a user asks the agent to create or trigger a release for this repository, publish a VSIX through .github/workflows/release.yml, or perform the manual workflow_dispatch release path safely."
---

# Release Process

This skill tells the agent how to execute a release request for this repository based on [.github/workflows/release.yml](../../workflows/release.yml).

## Agent Goal

When the user asks to create a release, the agent should prefer the manual `workflow_dispatch` path in [.github/workflows/release.yml](../../workflows/release.yml). That path is the only one that the agent can initiate directly without first creating a GitHub release by some other mechanism.

## Required Behavior

The agent must do all of the following:

1. Determine the target release version.
2. Verify the repository is ready to release before triggering GitHub Actions.
3. Trigger the `Release VSIX` workflow with the requested version.
4. Report what was triggered and any blockers found.

## Preconditions The Agent Must Check

Before triggering the workflow, the agent must verify these conditions:

1. The requested release version is explicit, for example `0.1.2`.
2. Local validation succeeds with the same commands the workflow relies on.

If [package.json](../../../package.json) does not already match the requested version, the manual workflow now creates release branch `release/v<version>`, runs `bun pm version <version>`, and uses Bun's generated version-bump commit and tag.

The workflow uses the provided version for:

- creating tag `v<version>`
- creating release branch `release/v<version>` when [package.json](../../../package.json) needs to be patched
- naming the VSIX file `vscode-xunit-viewer-<release_version>.vsix`

Because the workflow can create a version-bump commit on the manual path, the agent should call out that side effect when triggering a release.

## Default Release Procedure

When the user asks to create a release, the agent should follow this sequence:

1. If the user did not provide a version, ask for it.
2. Read [package.json](../../../package.json) and note whether its `version` already equals the requested version.
3. Run the local validation commands from the repository root:

```sh
bun install --frozen-lockfile
bun run build
bun run test
```

4. If validation fails, do not trigger the release workflow. Report the failure and fix it only if the user asked for that work.
5. If validation passes, trigger the workflow with GitHub CLI:

```sh
gh workflow run .github/workflows/release.yml -f version=<version>
```

6. After triggering, fetch the most recent run for confirmation and share its status with the user, including whether the workflow will need to create `release/v<version>` to patch [package.json](../../../package.json).

## Suggested Command Sequence

Use commands equivalent to these from the repository root:

```sh
sed -n '1,160p' package.json
bun install --frozen-lockfile
bun run build
bun run test
gh workflow run .github/workflows/release.yml -f version=<version>
gh run list --workflow release.yml --limit 1
```

Use the exact workflow path for dispatch. The workflow itself creates and pushes annotated tag `v<version>` during its `prepare-release` job. When [package.json](../../../package.json) is behind the requested version, it also creates and pushes branch `release/v<version>` first so the tag points at the version-bump commit.

## What The Workflow Will Do

After dispatch, GitHub Actions will:

1. Check out the repository.
2. If needed, create and push branch `release/v<version>` with the `bun pm version <version>` version-bump commit and tag.
3. Create and push annotated tag `v<version>`.
4. Compute the release metadata.
5. Set up Bun `1.3.10`.
6. Check out the tagged ref for the build job.
7. Install dependencies with `bun install --frozen-lockfile`.
8. Run `bun run build`.
9. Run `bun run test`.
10. Package the extension as `vscode-xunit-viewer-<release_version>.vsix`.
11. Attach the VSIX to the GitHub release for that tag.

## When To Stop And Ask The User

The agent must stop and ask the user instead of dispatching if any of these are true:

1. No release version was provided.
2. Local build or test fails.
3. The user asks for a release but there are additional versioning or changelog changes they expect and have not asked the agent to make.

## Response Pattern

When the release was triggered successfully, report:

1. the version used
2. that the manual `workflow_dispatch` path was used
3. that the workflow will create tag `v<version>`
4. whether it will also create branch `release/v<version>` to patch [package.json](../../../package.json)
5. the confirmation from `gh workflow run` or `gh run list`

When the release was not triggered, report the exact blocker and the minimal next action needed from the user.

## Do Not Use This Skill For

- general explanations of how GitHub releases work in theory
- editing unrelated CI workflows
- version bumping unless the user also asked for that change

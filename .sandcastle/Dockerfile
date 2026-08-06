FROM node:22-bookworm

# Install system dependencies.
# tini: a minimal init/zombie-reaper used as PID 1 (see ENTRYPOINT). The agent
# runs test suites (vitest/jest fork pools) whose workers reparent to PID 1 when
# orphaned; with `sleep` as PID 1 they were never wait()'d and piled up as
# hundreds of <defunct> processes, thrashing the sandbox. tini reaps them.
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  tini \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm at the same version the host pins in package.json#packageManager
# (11.17.0). We install via npm rather than corepack: the original
# `corepack enable && corepack prepare` setup was observed to deadlock on
# `pnpm install` against bind-mounted node_modules on macOS Docker — process
# stuck in do_epoll_wait with zero filesystem progress. Bypassing corepack
# keeps the version aligned with the host while avoiding the corepack-shim
# code path that appears to be the deadlock site.
RUN npm install -g pnpm@11.17.0

# Rename the base image's "node" user (UID 1000) to "agent" and keep its home dir.
RUN usermod -d /home/agent -m -l agent node
USER agent

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Sandcastle's docker sandbox runs the container as the host user's UID/GID
# (see node_modules/@ai-hero/sandcastle/dist/sandboxes/docker.js -> user: hostUid:hostGid),
# which is typically NOT 1000 (e.g. 501 on macOS). Open /home/agent so the runtime
# UID can write .gitconfig, ~/.config, etc. Done after the Claude install so any
# files it created get the same treatment.
USER root
RUN chmod -R a+rwX /home/agent
USER agent

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
# Run under tini as PID 1 so orphaned test-worker processes get reaped instead
# of accumulating as zombies. `docker exec` descendants reparent to this PID 1.
ENTRYPOINT ["/usr/bin/tini", "-s", "--", "sleep", "infinity"]

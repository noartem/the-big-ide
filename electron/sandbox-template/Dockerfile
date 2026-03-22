ARG BASE_IMAGE=node:20-bookworm
FROM ${BASE_IMAGE}

ARG APP_UID=1000
ARG APP_GID=1000
ARG APP_USER=bigide

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  zsh \
  git \
  curl \
  ca-certificates \
  vim \
  less \
  fzf \
  procps \
  iproute2 \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

RUN if ! getent group "${APP_GID}" >/dev/null; then groupadd --gid "${APP_GID}" "${APP_USER}"; fi && \
  if ! id -u "${APP_USER}" >/dev/null 2>&1; then \
  useradd --uid "${APP_UID}" --gid "${APP_GID}" --create-home --shell /bin/zsh "${APP_USER}"; \
  fi

ENV HOME=/home/${APP_USER}
ENV XDG_CONFIG_HOME=${HOME}/.config
ENV XDG_CACHE_HOME=${HOME}/.cache
ENV XDG_STATE_HOME=${HOME}/.local/state
ENV PATH=${HOME}/.npm-global/bin:${PATH}

RUN mkdir -p \
  /workspace \
  ${HOME}/.npm-global \
  ${XDG_CONFIG_HOME}/opencode \
  ${XDG_CACHE_HOME}/opencode \
  ${XDG_STATE_HOME}/opencode \
  && chown -R ${APP_UID}:${APP_GID} /workspace ${HOME}

RUN npm config set prefix "${HOME}/.npm-global" && npm install -g opencode-ai@latest

WORKDIR /workspace
CMD ["sh", "-lc", "tail -f /dev/null"]

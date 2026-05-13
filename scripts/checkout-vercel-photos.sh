#!/usr/bin/env sh
set -eu

PHOTO_REPOSITORY="${PHOTO_REPOSITORY:-Jackyhq/Photography-Photos}"
PHOTO_REPOSITORY_BRANCH="${PHOTO_REPOSITORY_BRANCH:-main}"
PHOTO_DIR="${PHOTO_DIR:-photos}"

if [ -d "${PHOTO_DIR}/.git" ]; then
  echo "Using existing photo repository at ${PHOTO_DIR}."
  exit 0
fi

if [ -d "${PHOTO_DIR}" ] && [ -n "$(find "${PHOTO_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "Using existing non-empty ${PHOTO_DIR} directory."
  exit 0
fi

if [ -z "${PHOTO_REPO_TOKEN:-}" ]; then
  echo "PHOTO_REPO_TOKEN is required to clone ${PHOTO_REPOSITORY} for Vercel Preview builds."
  echo "Add it to the Vercel project as a Preview environment variable with read-only Contents access."
  exit 1
fi

askpass_file="$(mktemp)"
trap 'rm -f "${askpass_file}"' EXIT INT TERM

cat >"${askpass_file}" <<'EOF'
#!/usr/bin/env sh
case "$1" in
  *Username*) printf '%s\n' "x-access-token" ;;
  *Password*) printf '%s\n' "${PHOTO_REPO_TOKEN}" ;;
  *) printf '\n' ;;
esac
EOF
chmod 700 "${askpass_file}"

echo "Cloning ${PHOTO_REPOSITORY}@${PHOTO_REPOSITORY_BRANCH} into ${PHOTO_DIR}."
GIT_ASKPASS="${askpass_file}" \
  GIT_TERMINAL_PROMPT=0 \
  git clone --depth=1 --branch "${PHOTO_REPOSITORY_BRANCH}" \
  "https://github.com/${PHOTO_REPOSITORY}.git" "${PHOTO_DIR}"

git -C "${PHOTO_DIR}" remote set-url origin "https://github.com/${PHOTO_REPOSITORY}.git"

# Python base image for the Codespace. Its apt sources include the Yarn repository, whose signing key is out of
# date: "apt-get update" then fails and the Docker feature cannot install. Lumen-X does not use Yarn, so it is removed.
FROM mcr.microsoft.com/devcontainers/python:1-3.12-bookworm
RUN rm -f /etc/apt/sources.list.d/*yarn* ; grep -rl yarnpkg /etc/apt/sources.list.d 2>/dev/null | xargs -r rm -f ; true

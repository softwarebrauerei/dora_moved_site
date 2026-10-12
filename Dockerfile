# syntax=docker/dockerfile:1
FROM nginxinc/nginx-unprivileged:1.30.5-alpine

# The server config is rendered at start-up from OLD_URL / NEW_URL. It goes to
# /tmp so the root filesystem can stay read-only (Kubernetes mounts an
# emptyDir at /tmp). The filter keeps envsubst away from nginx's own $vars.
ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp/nginx \
    NGINX_ENVSUBST_FILTER="^(OLD_HOST|NEW_HOST|NEW_URL)$"

USER root
RUN rm /etc/nginx/conf.d/default.conf \
 && sed -i -e 's|^worker_processes .*|worker_processes  2;|' \
           -e 's|include /etc/nginx/conf.d/\*.conf;|include /tmp/nginx/*.conf;|' /etc/nginx/nginx.conf \
 && grep -q '^worker_processes  2;' /etc/nginx/nginx.conf \
 && grep -q 'include /tmp/nginx/\*.conf;' /etc/nginx/nginx.conf
USER 101

COPY nginx/default.conf.template /etc/nginx/templates/
COPY nginx/security-headers.conf /etc/nginx/snippets/
COPY --chmod=755 docker-entrypoint.d/05-moved-site.envsh /docker-entrypoint.d/
COPY site/ /usr/share/nginx/html/

EXPOSE 8080

FROM nginx:alpine

# Páginas estáticas servidas pelo Nginx
# O config.js (endereço da API) é gerado pelo Ansible antes do build
COPY index.html listar.html config.js /usr/share/nginx/html/

EXPOSE 80

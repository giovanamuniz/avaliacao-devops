# Cadastro de Produtos: Avaliação Prática de DevOps (Prova A)

Aplicação distribuída em duas máquinas virtuais, com infraestrutura automatizada e serviços executados em contêineres Docker.

## Integrantes

- Betânia Amâncio Pereira
- Giovana Muniz dos Santos
- Luis Fernando Menezes Ferreira Leite

## Endereço de acesso

- **Aplicação web (VM1):** http://192.168.122.248
- **API REST (VM2):** http://IP_DA_VM2:3000/produtos

Os IPs são atribuídos pelo DHCP da rede `default` do libvirt e aparecem em `tofu output ips`.

## Arquitetura

| Máquina | Contêineres | Função |
|---|---|---|
| VM1 (`vm1`) | `web-produtos` (Nginx) | Página HTML com o formulário de cadastro e o link "Listar todos os produtos" |
| VM2 (`vm2`) | `api` (Node.js + Express) e `db` (MySQL 8.0) | API REST com as rotas `POST /produto` e `GET /produtos`, com persistência no MySQL |

O navegador carrega as páginas da VM1, e o JavaScript delas faz requisições HTTP para a API da VM2. A API e o MySQL se comunicam pela rede interna do Docker Compose (o MySQL não é exposto fora da VM2). Os dados ficam no volume `dados_mysql`.

| Etapa | Ferramenta | O que faz |
|---|---|---|
| Provisionamento | OpenTofu + libvirt/KVM (`iac/main.tf`) | Cria a VM1 e a VM2 a partir da imagem cloud do Ubuntu 24.04 |
| Configuração inicial | cloud-init (`iac/cloud_init.yaml`) | Cria o usuário `aluno` com acesso SSH por chave e instala o Docker e o Docker Compose |
| Implantação | Ansible (`ansible/playbook.yml`) | Copia os arquivos, gera as configurações com os IPs reais e sobe os contêineres |

### CORS

A página da VM1 e a API da VM2 têm origens diferentes, então o navegador exige CORS. A API responde com `Access-Control-Allow-Origin` apenas para a origem da aplicação web (`http://192.168.122.248`, definida pelo Ansible na variável `CORS_ORIGIN`), libera os métodos `GET`, `POST` e `OPTIONS` e o cabeçalho `Content-Type`, e responde às requisições `OPTIONS` (preflight) com `204`.

## Estrutura

```
avaliacao/
├── ansible/
│   ├── inventory          # gerado a partir do OpenTofu (tofu output -raw inventario)
│   └── playbook.yml       # implanta a API + MySQL na VM2 e a aplicação web na VM1
├── iac/
│   ├── cloud_init.yaml    # usuário, SSH e instalação do Docker
│   └── main.tf            # provisiona a VM1 e a VM2
├── app/
│   ├── Dockerfile         # Nginx servindo as páginas
│   ├── index.html         # formulário de cadastro
│   ├── listar.html        # listagem de produtos
│   └── config.js          # endereço da API (gerado pelo Ansible na implantação)
├── api/
│   ├── Dockerfile         # imagem da API Node.js
│   ├── docker-compose.yml # serviços api e db (MySQL)
│   ├── package.json
│   ├── server.js          # rotas POST /produto e GET /produtos
│   └── .env.example       # variáveis esperadas (o .env real é gerado pelo Ansible)
└── README.md
```

## Pré-requisitos (máquina hospedeira)

- Linux com virtualização ativada na BIOS, `qemu-kvm`, `libvirt` e a rede `default` ativa
- OpenTofu e Ansible
- Par de chaves SSH em `~/.ssh/devops_lab` e `~/.ssh/devops_lab.pub`. Para gerar:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/devops_lab -N ""
```

Nenhuma chave privada, senha de produção ou arquivo de estado do OpenTofu é versionado.

## Execução

```bash
# 1. Provisionar as VMs
cd iac
tofu init
tofu apply
tofu output ips

# 2. Gerar o inventário do Ansible com os IPs reais
tofu output -raw inventario > ../ansible/inventory

# 3. Testar a conexão (deve responder "pong")
cd ../ansible
ansible all -i inventory -m ping

# 4. Implantar os serviços
ansible-playbook -i inventory playbook.yml
```

Se a imagem do Ubuntu já estiver baixada, use o arquivo local:

```bash
tofu apply -var imagem_base=~/imagens-vm/noble-server-cloudimg-amd64.img
```

## Testes

```bash
# Cadastrar um produto
curl -X POST http://IP_DA_VM2:3000/produto -H "Content-Type: application/json" -d '{"nome":"Teclado","categoria":"Informática","preco":149.90,"quantidade":12}'

# Listar os produtos
curl http://IP_DA_VM2:3000/produtos

# Conferir os registros direto no MySQL (dentro da VM2)
sudo docker compose -f /opt/api/docker-compose.yml exec db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" loja -e "SELECT * FROM produtos;"'
```

## Reconstrução

```bash
cd iac
tofu destroy
tofu apply
tofu output -raw inventario > ../ansible/inventory
cd ../ansible
ansible-playbook -i inventory playbook.yml
```

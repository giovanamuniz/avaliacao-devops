terraform {
  required_providers {
    libvirt = {
      source  = "dmacvicar/libvirt"
      version = "0.8.3"
    }
  }
}

provider "libvirt" {
  uri = "qemu:///system"
}

# Imagem base do Ubuntu 24.04: URL (padrão) ou caminho de um arquivo já baixado
variable "imagem_base" {
  description = "URL ou caminho local da imagem cloud do Ubuntu 24.04"
  type        = string
  default     = "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
}

# Chave pública que o cloud-init coloca nas VMs (a privada fica só na máquina hospedeira)
variable "chave_publica" {
  description = "Caminho da chave pública SSH autorizada nas VMs"
  type        = string
  default     = "~/.ssh/devops_lab.pub"
}

# As duas máquinas da arquitetura e seus recursos
locals {
  vms = {
    vm1 = { memoria = 1024, vcpu = 1 } # aplicação web (Nginx + HTML)
    vm2 = { memoria = 2048, vcpu = 2 } # API Node.js + MySQL
  }
}

# Imagem base, copiada uma vez para o pool do libvirt
resource "libvirt_volume" "base" {
  name   = "avaliacao-ubuntu-base.qcow2"
  pool   = "default"
  source = pathexpand(var.imagem_base)
  format = "qcow2"
}

# Disco de cada VM: guarda só as diferenças em relação à imagem base (até 10 GB)
resource "libvirt_volume" "disco" {
  for_each = local.vms

  name           = "avaliacao-${each.key}.qcow2"
  pool           = "default"
  base_volume_id = libvirt_volume.base.id
  size           = 10 * 1024 * 1024 * 1024
  format         = "qcow2"
}

# Disco do cloud-init de cada VM, gerado a partir do template
resource "libvirt_cloudinit_disk" "init" {
  for_each = local.vms

  name = "avaliacao-${each.key}-cloudinit.iso"
  pool = "default"
  user_data = templatefile("${path.module}/cloud_init.yaml", {
    hostname = each.key
    ssh_key  = trimspace(file(pathexpand(var.chave_publica)))
  })
}

# As máquinas virtuais
resource "libvirt_domain" "vm" {
  for_each = local.vms

  name      = each.key
  memory    = each.value.memoria
  vcpu      = each.value.vcpu
  cloudinit = libvirt_cloudinit_disk.init[each.key].id

  cpu {
    mode = "host-passthrough"
  }

  network_interface {
    network_name   = "default"
    wait_for_lease = true
  }

  disk {
    volume_id = libvirt_volume.disco[each.key].id
  }

  # Console serial: sem ele, imagens cloud podem travar no boot
  console {
    type        = "pty"
    target_type = "serial"
    target_port = "0"
  }
}

# IPs das VMs
output "ips" {
  value = { for nome, vm in libvirt_domain.vm : nome => vm.network_interface[0].addresses[0] }
}

# Inventário do Ansible pronto, com os IPs reais
# Uso: tofu output -raw inventario > ../ansible/inventory
output "inventario" {
  value = <<-EOT
    [web]
    vm1 ansible_host=${libvirt_domain.vm["vm1"].network_interface[0].addresses[0]}

    [api]
    vm2 ansible_host=${libvirt_domain.vm["vm2"].network_interface[0].addresses[0]}

    [all:vars]
    ansible_user=aluno
    ansible_ssh_private_key_file=${trimsuffix(var.chave_publica, ".pub")}
    ansible_python_interpreter=/usr/bin/python3
    ansible_ssh_common_args='-o StrictHostKeyChecking=accept-new'
  EOT
}

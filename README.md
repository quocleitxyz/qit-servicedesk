# QIT Service Desk

Hệ thống IT Helpdesk quản lý ticket, tài liệu và người dùng.

## 1. Công nghệ sử dụng

- Frontend: React + Vite
- Backend: FastAPI
- Database: PostgreSQL
- Container: Docker
- CI/CD: GitHub Actions
- Container Registry: Docker Hub
- Deployment: Kubernetes
- GitOps: Argo CD

## 2. Quy trình CI/CD

```text
Developer
   |
   | git push
   v
GitHub Repository
   |
   v
GitHub Actions
   |-- Test
   |-- Build Docker Image
   |-- Push Image to Docker Hub
   |-- Update Image Tag
   v
Argo CD
   |
   v
Kubernetes Cluster
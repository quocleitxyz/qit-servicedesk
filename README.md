# QIT Service Desk

Hệ thống IT helpdesk: ticket, kho tài liệu, quản lý người dùng, giao diện Việt/Anh.
**React (Vite) + FastAPI + PostgreSQL**, triển khai bằng **GitHub Actions → Docker Hub → Argo CD → Kubernetes**.

```
git push ─► CI: test ─► build image (sha-xxxxxxx) ─► ghi tag vao k8s/overlays/dev
                                                              │
   Argo CD qit-dev-app      ─► namespace qit-dev      :30082 ◄────┘  tu dong
        │  workflow "Promote to staging" (bam tay)
   Argo CD qit-staging-app  ─► namespace qit-staging  :30081         kiem thu
        │  workflow "Promote to prod" (bam tay, go PROD, co phe duyet)
   Argo CD qit-prod-app     ─► namespace qit-prod     :30080         nguoi dung that
```

Một image được build một lần rồi đi qua cả ba môi trường, không build lại.

## 1. Ba môi trường

| | QIT-DEV | QIT-STAGING | QIT-PROD |
|---|---|---|---|
| Dùng cho | lập trình viên, code mới nhất | kiểm thử trước khi phát hành | người dùng thật |
| Namespace | `qit-dev` | `qit-staging` | `qit-prod` |
| Ứng dụng Argo CD | `qit-dev-app` | `qit-staging-app` | `qit-prod-app` |
| Địa chỉ | `http://<node-ip>:30082` | `http://<node-ip>:30081` | `http://<node-ip>:30080` |
| Database | `qit_dev_db` | `qit_staging_db` | `qit_prod_db` |
| User database | `qit_dev_user` | `qit_staging_user` | `qit_prod_user` |
| Tài khoản demo | có | không | không |
| Số pod backend / frontend | 1–2 / 1–2 | 1–3 / 1–2 | 2–10 / 2–6 |
| Ổ lưu file (Longhorn) | 2 GB | 5 GB | 10 GB |
| Nhận bản mới bằng | CI, mỗi lần push | **Promote to staging** | **Promote to prod** |
| File cấu hình | `k8s/overlays/dev` | `k8s/overlays/staging` | `k8s/overlays/prod` |

Quy ước tên: `qit-<môi trường>` cho namespace, thêm đuôi chỉ loại cho thứ khác: `_db` (database), `_user` (user database),
`-app` (ứng dụng Argo CD), `-pvc` (ổ lưu file), `-secret` (Secret). PVC và Secret trùng tên ở ba môi trường vì nằm trong ba namespace khác nhau.

## 2. Cấu trúc thư mục

```
qit-servicedesk/
├── frontend/                 React, chay bang nginx
├── backend/                  FastAPI (app/, tests/)
├── database/
│   ├── create-db.sh          tao database cho mot moi truong (dev / staging / prod)
│   └── refresh-staging.sh    chep du lieu prod sang staging
├── k8s/
│   ├── base/                 cau hinh chung cho moi moi truong
│   ├── components/uploads/   gan o luu file vao backend
│   ├── overlays/dev|staging|prod/   phan rieng cua tung moi truong
│   └── optional/             mau Secret, Ingress (khong tu dong ap dung)
├── argocd/                   qit-dev-app.yaml, qit-staging-app.yaml, qit-prod-app.yaml
├── .github/workflows/        ci.yaml, promote-staging.yaml, promote-prod.yaml
└── docker-compose.yml        chay tren may ca nhan
```

## 3. Chạy trên máy cá nhân

```bash
copy .env.example .env
docker compose up -d --build
```

Mở `http://localhost:8080`. Tài khoản demo: `admin@qit.local / QitAdmin!2026`,
`support@qit.local / QitSupport!2026`, `user@qit.local / QitUser!2026`.

| Việc | Lệnh |
|---|---|
| Xem log | `docker compose logs -f backend` |
| Tắt, giữ dữ liệu | `docker compose down` |
| Tắt, xóa dữ liệu | `docker compose down -v` |
| Chạy test backend | `cd backend && pip install -r requirements-dev.txt && pytest` |

## 4. Dựng từ đầu

### 4.1. Chuẩn bị một lần

| Việc | Cách làm |
|---|---|
| Repo GitHub | Tạo repo `qit-servicedesk`, đẩy source lên nhánh `main` |
| Secret của repo (Settings → Secrets and variables → Actions) | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` |
| Longhorn trên cụm | `kubectl get storageclass` phải có `longhorn` |
| Gói NFS client trên **mọi** node | `sudo apt-get install -y nfs-common` |
| Argo CD đọc được repo | Repo private: thêm repo trong Argo CD (Settings → Repositories) |

Nếu repo có tên khác, sửa `repoURL` trong ba file `argocd/*.yaml`.

### 4.2. Dựng một môi trường

Làm lần lượt cho `dev`, rồi `staging`, rồi `prod`. Thay `<env>` bằng tên môi trường.

**Bước 1. Database** (trên VM database):

```bash
sudo bash database/create-db.sh
```

Script hỏi tên môi trường và mật khẩu, tạo database `qit_<env>_db` và user `qit_<env>_user`.

**Bước 2. Namespace và Secret** (trên `k8s-master`):

```bash
kubectl create namespace qit-<env>

kubectl create secret generic qit-db-secret -n qit-<env> \
  --from-literal=DB_USER=qit_<env>_user \
  --from-literal=DB_PASSWORD='MAT_KHAU_DATABASE'

kubectl create secret generic qit-backend-secret -n qit-<env> \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=ADMIN_EMAIL='admin@congty.vn' \
  --from-literal=ADMIN_PASSWORD='MAT_KHAU_ADMIN'
```

`ADMIN_EMAIL` và `ADMIN_PASSWORD` là tài khoản IT Admin đầu tiên, backend tự tạo khi khởi động nếu
chưa có. Staging và prod không có tài khoản demo nên bắt buộc phải có hai giá trị này. Mật khẩu tối
thiểu 8 ký tự; đổi lại trong trang Tài khoản sau lần đăng nhập đầu.

**Bước 3. Đăng ký ứng dụng Argo CD**:

```bash
kubectl apply -f argocd/qit-<env>-app.yaml
```

| Môi trường | Đăng ký khi nào |
|---|---|
| dev | Sau khi CI chạy xong lần đầu (đã có image) |
| staging | Sau khi chạy **Promote to staging** lần đầu |
| prod | Sau khi chạy **Promote to prod** lần đầu |

Đăng ký sớm hơn thì pod báo `ImagePullBackOff` vì tag còn là `not-deployed-yet`; tự hết sau khi promote.

**Bước 4. Kiểm tra**:

```bash
kubectl -n qit-<env> get pods,pvc
kubectl -n qit-<env> logs deploy/qit-backend | grep -i -E "upload|administrator"
curl -s http://<node-ip>:<cong>/api/health
```

Kết quả đúng: pod `Running`, PVC `qit-uploads-pvc` ở trạng thái `Bound`, `/api/health` trả về đúng `environment`.

## 5. Phát hành

Vào GitHub → **Actions** → chọn workflow → **Run workflow**.

| Workflow | Việc nó làm | Chốt an toàn |
|---|---|---|
| **QIT CI** | Mỗi lần push: test, build image, triển khai lên dev | Test phải đạt |
| **Promote to staging** | Lấy tag đang chạy ở dev ghi sang staging | Image phải có trên Docker Hub |
| **Promote to prod** | Lấy tag đang chạy ở staging ghi sang prod | Phải gõ `PROD`; có thể thêm người duyệt |

- Thêm người duyệt: Settings → Environments → `prod` → Required reviewers (repo private cần gói GitHub trả phí).
- Quay lại bản cũ: chạy workflow promote, điền tag cũ vào ô `tag` (xem `git log -- k8s/overlays/<env>`).
- Thay đổi chỉ nằm trong `k8s/`, `argocd/` hoặc file `.md` thì không build lại image.
- Argo CD kiểm tra Git khoảng 3 phút một lần; bấm **Refresh** để đồng bộ ngay.

## 6. Lưu file của kho tài liệu

```
nguoi dung ─► frontend (nginx, toi da 60 MB) ─► backend ─► /data/uploads ══► o Longhorn (PVC qit-uploads-pvc)
```

- Mỗi môi trường có một ổ riêng, khai báo trong `k8s/overlays/<env>/storage.yaml`.
- Ổ ở chế độ `ReadWriteMany`: mọi pod backend dùng chung một bộ file.
- Giới hạn mỗi file: `MAX_UPLOAD_MB` (mặc định 50). Không nhận file chạy được (`.exe`, `.bat`...).
- File nằm trong cụm. Dựng lại cụm sẽ mất file nếu chưa cấu hình sao lưu Longhorn ra ngoài (NFS hoặc S3).
  Cần làm việc này trước khi prod chứa tài liệu thật.
- `database/refresh-staging.sh` chỉ chép database, không chép file.

## 7. Cấu hình backend

| Biến | Lấy từ | Ý nghĩa |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | ConfigMap | Kết nối PostgreSQL (`qit-postgres` trỏ tới VM database, IP trong `k8s/base/postgres.yaml`) |
| `DB_USER`, `DB_PASSWORD` | Secret `qit-db-secret` | |
| `JWT_SECRET` | Secret `qit-backend-secret` | Bắt buộc |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Secret `qit-backend-secret` | IT Admin đầu tiên |
| `APP_ENV` | ConfigMap | `dev`, `staging`, `production`; hiện dải băng màu trên web trừ production |
| `SEED_DEMO_USERS` | ConfigMap | Tạo tài khoản demo (chỉ dev) |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | ConfigMap | Thư mục và giới hạn file tải lên |

Kiểm tra sức khỏe: `GET /api/health` (sống), `GET /api/ready` (kết nối được database), `GET /healthz` (frontend).

## 8. Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Pod `ImagePullBackOff`, tag `not-deployed-yet` | Môi trường chưa được promote lần nào | Chạy CI hoặc workflow promote |
| Pod backend `ContainerCreating` mãi | Node thiếu `nfs-common`, hoặc Longhorn chưa sẵn sàng | `kubectl -n qit-<env> describe pod <ten-pod>` |
| PVC `Pending` | Không có storage class `longhorn` | `kubectl get storageclass`, sửa `storageClassName` trong `storage.yaml` |
| Pod backend `CrashLoopBackOff` | Sai mật khẩu database hoặc thiếu Secret | `kubectl -n qit-<env> logs deploy/qit-backend` |
| Không đăng nhập được trên staging/prod | Thiếu `ADMIN_EMAIL`/`ADMIN_PASSWORD` trong Secret | Tạo lại Secret rồi `kubectl -n qit-<env> rollout restart deploy/qit-backend` |

## 9. Bảo mật

- Không commit `.env`, mật khẩu thật hay Secret của Kubernetes.
- Tài khoản demo chỉ tồn tại ở local và dev.
- Mỗi user database chỉ vào được database của môi trường mình.
- Dùng Access Token của Docker Hub, không dùng mật khẩu tài khoản.
#   q i t - s e r v i c e d e s k  
 
# QIT Service Desk

> Hệ thống IT Helpdesk quản lý ticket, kho tài liệu và người dùng, hỗ
> trợ giao diện Việt/Anh.

**Stack:** React (Vite) · FastAPI · PostgreSQL\
**Triển khai:** GitHub Actions → Docker Hub → Argo CD → Kubernetes

------------------------------------------------------------------------

## Tổng quan CI/CD

``` text
Developer
   │
   └── git push
          │
          ▼
   GitHub Actions (CI)
   ├── Test
   ├── Build Docker image (SHA tag)
   └── Cập nhật image tag trong k8s/overlays/dev
          │
          ▼
   Argo CD: qit-dev-app
   Namespace: qit-dev       Port: 30082  (tự động triển khai)
          │
          └── Promote to staging (thủ công)
                  │
                  ▼
          Argo CD: qit-staging-app
          Namespace: qit-staging  Port: 30081  (kiểm thử)
                  │
                  └── Promote to prod (thủ công, có phê duyệt)
                          │
                          ▼
                  Argo CD: qit-prod-app
                  Namespace: qit-prod  Port: 30080  (production)
```

**Nguyên tắc phát hành:** Một Docker image được build một lần và promote
qua cả ba môi trường; không build lại image.

------------------------------------------------------------------------

## 1. Ba môi trường

  --------------------------------------------------------------------------------------------------
  Thông số          QIT-DEV                    QIT-STAGING                QIT-PROD
  ----------------- -------------------------- -------------------------- --------------------------
  Mục đích          Phát triển, cập nhật code  Kiểm thử trước phát hành   Người dùng thực tế
                    mới                                                   

  Namespace         `qit-dev`                  `qit-staging`              `qit-prod`

  Argo CD           `qit-dev-app`              `qit-staging-app`          `qit-prod-app`
  Application                                                             

  Địa chỉ           `http://<node-ip>:30082`   `http://<node-ip>:30081`   `http://<node-ip>:30080`

  Database          `qit_dev_db`               `qit_staging_db`           `qit_prod_db`

  Database user     `qit_dev_user`             `qit_staging_user`         `qit_prod_user`

  Tài khoản demo    Có                         Không                      Không

  Số pod backend /  1--2 / 1--2                1--3 / 1--2                2--10 / 2--6
  frontend                                                                

  Dung lượng        2 GB                       5 GB                       10 GB
  Longhorn                                                                

  Cách nhận bản mới CI sau mỗi lần push        **Promote to staging**     **Promote to prod**

  Thư mục cấu hình  `k8s/overlays/dev`         `k8s/overlays/staging`     `k8s/overlays/prod`
  --------------------------------------------------------------------------------------------------

**Quy ước đặt tên**

-   Namespace: `qit-<môi trường>`
-   Database: `qit_<môi trường>_db`
-   Database user: `qit_<môi trường>_user`
-   Argo CD Application: `qit-<môi trường>-app`
-   PVC: `qit-uploads-pvc`
-   Secret: `qit-db-secret`, `qit-backend-secret`

PVC và Secret có thể dùng cùng tên ở các môi trường vì mỗi môi trường
nằm trong namespace riêng.

------------------------------------------------------------------------

## 2. Cấu trúc thư mục

``` text
qit-servicedesk/
├── frontend/                       # React, chạy bằng Nginx
├── backend/                        # FastAPI (app/, tests/)
├── database/
│   ├── create-db.sh                # Tạo database cho dev/staging/prod
│   └── refresh-staging.sh          # Sao chép dữ liệu prod sang staging
├── k8s/
│   ├── base/                       # Cấu hình chung
│   ├── components/uploads/          # Gắn storage vào backend
│   ├── overlays/
│   │   ├── dev/                    # Cấu hình DEV
│   │   ├── staging/                # Cấu hình STAGING
│   │   └── prod/                   # Cấu hình PROD
│   └── optional/                   # Mẫu Secret, Ingress (không tự áp dụng)
├── argocd/                         # Các manifest Argo CD Application
├── .github/workflows/
│   ├── ci.yaml
│   ├── promote-staging.yaml
│   └── promote-prod.yaml
└── docker-compose.yml               # Chạy trên máy cá nhân
```

------------------------------------------------------------------------

## 3. Chạy trên máy cá nhân

### Khởi động

``` bash
copy .env.example .env
docker compose up -d --build
```

Mở: `http://localhost:8080`

**Tài khoản demo:**

  Vai trò   Tài khoản             Mật khẩu
  --------- --------------------- -------------------
  Admin     `admin@qit.local`     `QitAdmin!2026`
  Support   `support@qit.local`   `QitSupport!2026`
  User      `user@qit.local`      `QitUser!2026`

### Các lệnh thường dùng

  ---------------------------------------------------------------------------------------------------
  Tác vụ                              Lệnh
  ----------------------------------- ---------------------------------------------------------------
  Xem log backend                     `docker compose logs -f backend`

  Dừng, giữ dữ liệu                   `docker compose down`

  Dừng và xóa dữ liệu                 `docker compose down -v`

  Chạy test backend                   `cd backend && pip install -r requirements-dev.txt && pytest`
  ---------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 4. Triển khai môi trường Kubernetes

### 4.1. Chuẩn bị một lần

  -----------------------------------------------------------------------
  Hạng mục                            Yêu cầu
  ----------------------------------- -----------------------------------
  GitHub repository                   Repo `qit-servicedesk`, source trên
                                      nhánh `main`

  GitHub Actions Secrets              `DOCKERHUB_USERNAME`,
                                      `DOCKERHUB_TOKEN`

  StorageClass                        `kubectl get storageclass` phải có
                                      `longhorn`

  NFS client                          Cài `nfs-common` trên tất cả node

  Argo CD repository                  Với repo private, thêm repo trong
                                      **Settings → Repositories**
  -----------------------------------------------------------------------

Cài NFS client trên các node:

``` bash
sudo apt-get install -y nfs-common
```

Nếu repository có tên khác, cập nhật `repoURL` trong ba file
`argocd/*.yaml`.

### 4.2. Dựng từng môi trường

Thực hiện lần lượt `dev`, `staging`, rồi `prod`. Thay `<env>` bằng tên
môi trường tương ứng.

#### Bước 1 --- Tạo database (trên VM database)

``` bash
sudo bash database/create-db.sh
```

Script yêu cầu nhập môi trường và mật khẩu, sau đó tạo database
`qit_<env>_db` cùng user `qit_<env>_user`.

#### Bước 2 --- Tạo namespace và Secret (trên k8s-master)

``` bash
kubectl create namespace qit-<env>

kubectl create secret generic qit-db-secret -n qit-<env> \
  --from-literal=DB_USER=qit_<env>_user \
  --from-literal=DB_PASSWORD='MAT_KHAU_DATABASE'

kubectl create secret generic qit-backend-secret -n qit-<env> \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=ADMIN_EMAIL='admin@congty.vn' \
  --from-literal=ADMIN_PASSWORD='MAT_KHAU_ADMIN'
```

`ADMIN_EMAIL` và `ADMIN_PASSWORD` là tài khoản IT Admin đầu tiên.
Backend tự tạo tài khoản khi khởi động nếu chưa tồn tại. Staging và prod
không có tài khoản demo nên cần khai báo hai giá trị này.

-   Mật khẩu tối thiểu 8 ký tự.
-   Đổi mật khẩu trong trang Tài khoản sau lần đăng nhập đầu tiên.

#### Bước 3 --- Đăng ký ứng dụng Argo CD

``` bash
kubectl apply -f argocd/qit-<env>-app.yaml
```

  Môi trường   Thời điểm đăng ký
  ------------ ----------------------------------------------
  DEV          Sau khi CI chạy lần đầu và image đã được tạo
  STAGING      Sau lần **Promote to staging** đầu tiên
  PROD         Sau lần **Promote to prod** đầu tiên

Nếu đăng ký sớm, pod có thể báo `ImagePullBackOff` do tag
`not-deployed-yet`. Tình trạng sẽ hết sau khi promote image.

#### Bước 4 --- Kiểm tra

``` bash
kubectl -n qit-<env> get pods,pvc
kubectl -n qit-<env> logs deploy/qit-backend | grep -i -E "upload|administrator"
curl -s http://<node-ip>:<port>/api/health
```

Kết quả mong đợi:

-   Pod ở trạng thái `Running`.
-   PVC `qit-uploads-pvc` ở trạng thái `Bound`.
-   API `/api/health` trả về thông tin `environment` phù hợp.

------------------------------------------------------------------------

## 5. Quy trình phát hành

Truy cập **GitHub → Actions**, chọn workflow và nhấn **Run workflow**.

  -----------------------------------------------------------------------
  Workflow                Chức năng               Điều kiện an toàn
  ----------------------- ----------------------- -----------------------
  **QIT CI**              Mỗi lần push: test,     Test phải đạt
                          build image, cập nhật   
                          DEV                     

  **Promote to staging**  Promote image đang chạy Image đã có trên Docker
                          ở DEV sang STAGING      Hub

  **Promote to prod**     Promote image từ        Nhập `PROD`; có thể yêu
                          STAGING sang PROD       cầu phê duyệt
  -----------------------------------------------------------------------

### Vận hành phát hành

-   Thêm người phê duyệt: **Settings → Environments → `prod` → Required
    reviewers** (repository private có thể cần gói GitHub trả phí).
-   Rollback: chạy workflow promote và nhập tag image cũ. Xem lịch sử
    bằng `git log -- k8s/overlays/<env>`.
-   Thay đổi chỉ ở `k8s/`, `argocd/` hoặc file `.md` thì không cần build
    lại image.
-   Argo CD kiểm tra Git khoảng 3 phút/lần. Có thể nhấn **Refresh** để
    đồng bộ ngay.

------------------------------------------------------------------------

## 6. Lưu trữ file kho tài liệu

``` text
Người dùng
   └── Frontend (Nginx, tối đa 60 MB)
          └── Backend
                 └── /data/uploads
                        └── Longhorn PVC: qit-uploads-pvc
```

-   Mỗi môi trường có storage riêng, khai báo trong
    `k8s/overlays/<env>/storage.yaml`.
-   Storage dùng chế độ `ReadWriteMany`: các pod backend cùng truy cập
    một bộ file.
-   Giới hạn mỗi file: `MAX_UPLOAD_MB` (mặc định 50 MB).
-   Không cho phép file thực thi như `.exe`, `.bat`, ...
-   File được lưu trong cluster. Nếu dựng lại cluster, dữ liệu có thể
    mất khi chưa cấu hình backup Longhorn ra ngoài (NFS hoặc S3). Cần
    cấu hình backup trước khi PROD lưu tài liệu thực tế.
-   `database/refresh-staging.sh` chỉ sao chép database, không sao chép
    file.

------------------------------------------------------------------------

## 7. Cấu hình Backend

  ---------------------------------------------------------------------------
  Biến                    Nguồn                   Ý nghĩa
  ----------------------- ----------------------- ---------------------------
  `DB_HOST`, `DB_PORT`,   ConfigMap               Kết nối PostgreSQL
  `DB_NAME`                                       (`qit-postgres` trỏ tới VM
                                                  database; IP cấu hình trong
                                                  `k8s/base/postgres.yaml`)

  `DB_USER`,              Secret `qit-db-secret`  Thông tin database user
  `DB_PASSWORD`                                   

  `JWT_SECRET`            Secret                  Khóa JWT, bắt buộc
                          `qit-backend-secret`    

  `ADMIN_EMAIL`,          Secret                  Tài khoản IT Admin đầu tiên
  `ADMIN_PASSWORD`        `qit-backend-secret`    

  `APP_ENV`               ConfigMap               `dev`, `staging`,
                                                  `production`; hiển thị dải
                                                  màu trên web, trừ
                                                  production

  `SEED_DEMO_USERS`       ConfigMap               Tạo tài khoản demo (chỉ
                                                  DEV)

  `UPLOAD_DIR`,           ConfigMap               Thư mục lưu và giới hạn
  `MAX_UPLOAD_MB`                                 upload
  ---------------------------------------------------------------------------

### Health checks

-   `GET /api/health` --- kiểm tra ứng dụng đang sống.
-   `GET /api/ready` --- kiểm tra kết nối database.
-   `GET /healthz` --- health check frontend.

------------------------------------------------------------------------

## 8. Lỗi thường gặp

  ---------------------------------------------------------------------------------------------------------
  Triệu chứng             Nguyên nhân                      Cách xử lý
  ----------------------- -------------------------------- ------------------------------------------------
  Pod `ImagePullBackOff`, Môi trường chưa promote lần nào  Chạy CI hoặc workflow promote
  tag `not-deployed-yet`                                   

  Backend                 Node thiếu `nfs-common` hoặc     `kubectl -n qit-<env> describe pod <ten-pod>`
  `ContainerCreating` kéo Longhorn chưa sẵn sàng           
  dài                                                      

  PVC `Pending`           Không có StorageClass `longhorn` `kubectl get storageclass`; kiểm tra
                                                           `storageClassName` trong `storage.yaml`

  Backend                 Sai mật khẩu DB hoặc thiếu       `kubectl -n qit-<env> logs deploy/qit-backend`
  `CrashLoopBackOff`      Secret                           

  Không đăng nhập được    Thiếu                            Tạo lại Secret rồi restart deployment
  STAGING/PROD            `ADMIN_EMAIL`/`ADMIN_PASSWORD`   
                          trong Secret                     
  ---------------------------------------------------------------------------------------------------------

Lệnh restart backend:

``` bash
kubectl -n qit-<env> rollout restart deploy/qit-backend
```

------------------------------------------------------------------------

## 9. Bảo mật

-   Không commit `.env`, mật khẩu thật hoặc Kubernetes Secret.
-   Tài khoản demo chỉ tồn tại ở local và DEV.
-   Mỗi database user chỉ được truy cập database của môi trường tương
    ứng.
-   Sử dụng Docker Hub Access Token, không dùng mật khẩu tài khoản.

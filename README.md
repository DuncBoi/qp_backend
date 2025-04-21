# Quantapus API

This is the backend service for [quantapus.com](https://quantapus.com), deployed on an AWS EC2 instance with endpoints exposed via [api.quantapus.com](https://api.quantapus.com) through AWS's Application Load Balancer. It provides a REST API for user authentication, problem data retrieval and updates, and progress tracking. It is backed by a **PostgreSQL** database hosted on **AWS RDS**.

---

## Infrastructure

- **Networking**  
    The backend is a Node.js/Express.js application (`server.js`) running on a single AWS EC2 instance inside a VPC. All incoming traffic first hits an **AWS Application Load Balancer (ALB)** — deployed across three Availability Zones (`us-east-2a`, `us-east-2b`, `us-east-2c`) — which terminates SSL via **ACM**. Traffic is then routed to **nginx** on the EC2 instance, which reverse‑proxies HTTPS requests to the Express app on port 3000.


- **Database**  
  We persist all data in a **PostgreSQL** database hosted on **AWS RDS** and deployed in private subnets.

- **Auth**  
  Protected endpoints require a valid Firebase ID token in the `Authorization` header, which the backend verifies using the **Firebase Admin SDK** before granting access.

---

## Domain & SSL
- The API is served at [api.quantapus.com](https://api.quantapus.com), which is mapped via a CNAME record to the ALB’s DNS name.
- TLS is terminated at the ALB using an ACM-managed certificate.
- To maintain high availability, the ALB performs health checks against the `/` endpoint and automatically reroutes traffic away from any unhealthy targets.

---

## Database Schema

### `problems`
| Column       | Type               | Nullable |
|--------------|--------------------|----------|
| `id`         | INTEGER PRIMARY KEY| NO       |         
| `title`      | VARCHAR(100)       | NO       |         
| `difficulty` | VARCHAR(10)        | NO       |         
| `category`   | VARCHAR(40)        | NO       |         
| `description`| TEXT               | NO       |         
| `solution`   | TEXT               | NO       |         
| `explanation`| TEXT               | NO       |         
| `yt_link`    | TEXT               | YES      | 
| `roadmap`    | VARCHAR(50)        | YES      |       
| `roadmap_num`| INTEGER            | YES      | 

### `users`
| Column       | Type                         | Nullable | Default |
|--------------|------------------------------|----------|---------|
| `id`         | TEXT PRIMARY KEY             | NO       |         |
| `created_at` | TIMESTAMP WITH TIME ZONE     | NO       | now()   |

### `completed_problems`
| Column        | Type                       | Nullable | Default |
|---------------|----------------------------|----------|---------|
| `user_id`     | TEXT                       | NO       |         |
| `problem_id`  | INTEGER                    | NO       |         |
| `completed_at`| TIMESTAMP WITHOUT TIME ZONE| NO       | now()   |
| **Primary Key** | (`user_id`, `problem_id`) |          |         |


---

## API Endpoints

### Public Routes
- `GET /`  
  Health check endpoint (200 OK).

- `GET /problems`  
  Retrieve all problems.

- `GET /problems/:id`  
  Retrieve a specific problem by ID.

### Authenticated Routes
*Require a valid Firebase ID token in the `Authorization` header.*

- `POST /log-user`  
  Create or update a user in the database.

- `GET /completed-problems`  
  Fetch all problem IDs completed by the authenticated user.

- `POST /batch-toggle-complete`  
  Batch toggle problems as completed or incomplete.

- `POST /reset-progress`  
  Reset all completion records for the authenticated user.

- `POST /delete-user`  
  Delete the user from Firebase Auth and remove related database records (transactional).

### Admin Routes
*Require a `secretKey` in the request body matching the `ADMIN_SECRET` environment variable.*

- `POST /admin/post`  
  Insert a new problem.

- `PUT /problems/:id`  
  Update an existing problem by ID.

- `DELETE /problems/:id`  
  Delete a problem by ID.

---

## Security Features

- Rate limiting based on both userId and IP address.  
- Firebase ID token verification for protected routes.  
- Admin routes protected by a server-side secret.  
- EC2 security group restricts inbound traffic to the ALB only.  
- TLS termination at the ALB for encrypted traffic.

---

Built by Duncan Greene.

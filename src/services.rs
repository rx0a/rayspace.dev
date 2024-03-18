use crate::state::AppState;
use actix_session::Session;
use actix_web::{
    get, post, put, web,
    web::{Data, Json},
    HttpResponse, Responder,
};

use chrono::NaiveDate;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{self, FromRow};
use sqlx::{query, Row};
use std::env;

#[derive(Deserialize)]
struct Repo {
    stargazers_count: i32,
}

#[derive(Deserialize)]
pub struct Info {
    id: String,
}

#[derive(Serialize, FromRow)]
struct Post {
    id: i32,
    title: String,
    published_date: NaiveDate,
    views: i32,
}

#[derive(Serialize, FromRow)]
struct Comment {
    id: i32,
    name: String,
    comment: String,
}

#[derive(Deserialize)]
pub struct CreateComment {
    pub comment: String,
}

#[get("/github_stars")]
pub async fn fetch_stars(data: web::Data<AppState>) -> impl Responder {
    let cache = data.star_cache.read().expect("Failed to acquire read lock");
    if Utc::now()
        .signed_duration_since(cache.last_fetched)
        .num_minutes()
        < 15
    {
        return HttpResponse::Ok().json(serde_json::json!({ "stars": cache.star_count }));
    }
    drop(cache);

    let client = reqwest::Client::new();
    let owner = env::var("GITHUB_OWNER").unwrap_or_else(|_| String::from("rx0a"));
    let repo = env::var("GITHUB_REPO").unwrap_or_else(|_| String::from("rayspace.dev"));

    let request_url = format!(
        "https://api.github.com/repos/{owner}/{repo}",
        owner = owner,
        repo = repo
    );

    match client
        .get(&request_url)
        .header(reqwest::header::USER_AGENT, "rayspace.dev")
        .send()
        .await
    {
        Ok(response) => match response.json::<Repo>().await {
            Ok(repo) => {
                let mut cache = data.star_cache.write().expect("Failed to acquire write lock");
                cache.star_count = repo.stargazers_count;
                cache.last_fetched = Utc::now();

                HttpResponse::Ok().json(serde_json::json!({ "stars": repo.stargazers_count }))
            }
            Err(_) => {
                HttpResponse::InternalServerError().json("An error occurred")
            }
        },
        Err(_) => HttpResponse::InternalServerError().json("An error occurred"),
    }
}

#[put("/update_views/{id}")]
pub async fn update_views(info: web::Path<Info>, data: web::Data<AppState>) -> impl Responder {
    let id: i32 = info.id.parse().unwrap_or_default();

    match query("UPDATE posts SET views = views + 1 WHERE id = $1")
        .bind(id)
        .execute(&data.db)
        .await
    {
        Ok(_) => HttpResponse::Ok().json("Updated views"),
        Err(_) => {
            HttpResponse::InternalServerError().json("An error occurred")
        }
    }
}

#[get("/user_status")]
pub async fn user_status(session: Session) -> impl Responder {
    let user_id = session.get::<String>("user_id");
    let user_name = session.get::<String>("user_name");

    if let (Ok(Some(_)), Ok(Some(_))) = (user_id, user_name) {
        HttpResponse::Ok().json(serde_json::json!({
            "authenticated": true
        }))
    } else {
        HttpResponse::Ok().json(serde_json::json!({
            "authenticated": false
        }))
    }
}

#[get("/posts")]
pub async fn fetch_posts(state: Data<AppState>) -> impl Responder {
    match sqlx::query_as::<_, Post>("SELECT * FROM posts")
        .fetch_all(&state.db)
        .await
    {
        Ok(posts) => {
            if posts.is_empty() {
                HttpResponse::NotFound().json("No posts found")
            } else {
                HttpResponse::Ok().json(posts)
            }
        }
        Err(_) => {
            HttpResponse::InternalServerError().json("An error occurred")
        }
    }
}

#[get("/comments")]
pub async fn fetch_comments(state: Data<AppState>) -> impl Responder {
    match sqlx::query_as::<_, Comment>("SELECT id, name, comment FROM comments ORDER BY timestamp DESC LIMIT 100")
        .fetch_all(&state.db)
        .await
    {
        Ok(comments) => {
            if comments.is_empty() {
                HttpResponse::NotFound().json("No comments found")
            } else {
                HttpResponse::Ok().json(comments)
            }
        }
        Err(_) => {
            HttpResponse::InternalServerError().json("An error occurred")
        }
    }
}

#[post("/comments")]
pub async fn create_comment(
    session: Session,
    comment_body: Json<CreateComment>,
    data: web::Data<AppState>,
) -> impl Responder {
    const MAX_CHARS: usize = 255;

    let user_id = session.get::<String>("user_id");
    let user_name = session.get::<String>("user_name");

    if let (Ok(Some(user_id)), Ok(Some(user_name))) = (user_id, user_name) {
        if user_id.len() > MAX_CHARS
            || user_name.len() > MAX_CHARS
            || comment_body.comment.len() > MAX_CHARS
        {
            return HttpResponse::BadRequest().body("Input exceeds maximum allowed characters");
        }
        let sanitized_comment = ammonia::clean(&comment_body.comment);

        match sqlx::query(
            "INSERT INTO comments (userid, name, comment) VALUES ($1, $2, $3) RETURNING id, userid, name, comment, timestamp",
        )
        .bind(&user_id)
        .bind(&user_name)
        .bind(&sanitized_comment)
        .fetch_one(&data.db)
        .await
        {
            Ok(row) => {
                let id: Result<i32, _> = row.try_get(0);
                let userid: Result<String, _> = row.try_get(1);
                let name: Result<String, _> = row.try_get(2);
                let comment: Result<String, _> = row.try_get(3);
                let timestamp: Result<DateTime<Utc>, _> = row.try_get(4);

                match (id, userid, name, comment, timestamp) {
                    (Ok(id), Ok(userid), Ok(name), Ok(comment), Ok(timestamp)) => {
                        let comment = Comment {
                            id,
                            userid,
                            name,
                            comment,
                            timestamp,
                        };
                        HttpResponse::Ok().json(comment)
                    }
                    _ => HttpResponse::InternalServerError().body("Failed to parse comment fields"),
                }
            },
            Err(_) => HttpResponse::InternalServerError().body("Failed to create comment"),
        }
    } else {
        HttpResponse::Unauthorized().body("User must be logged in to create a comment")
    }
}
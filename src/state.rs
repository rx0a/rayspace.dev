use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};
use std::sync::{Arc, RwLock};

#[derive(Clone)]
pub struct StarCache {
    pub star_count: i32,
    pub last_fetched: DateTime<Utc>,
}

impl StarCache {
    fn new() -> Self {
        StarCache {
            star_count: 0,
            last_fetched: Utc::now(),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub github_client_id: String,
    pub github_client_secret: String,
    pub db: Pool<Postgres>,
    pub star_cache: Arc<RwLock<StarCache>>,
}

impl AppState {
    pub fn new(github_client_id: String, github_client_secret: String, db: Pool<Postgres>) -> Self {
        AppState {
            github_client_id,
            github_client_secret,
            db,
            star_cache: Arc::new(RwLock::new(StarCache::new())),
        }
    }
}
use actix_session::Session;
use actix_web::Scope;
use actix_web::{web, HttpResponse, Responder};
use rand::distributions::Alphanumeric;
use rand::Rng;
use std::collections::HashMap;
use crate::state::AppState;
use std::env;

pub fn auth_routes() -> Scope {
    web::scope("/auth")
        .route("/start_github_oauth", web::get().to(start_github_oauth))
        .route(
            "/github_oauth_redirect",
            web::get().to(github_oauth_redirect),
        )
        .route("/logout", web::post().to(logout))
}

pub async fn start_github_oauth(_session: Session, data: web::Data<AppState>) -> impl Responder {
    let AppState {
        github_client_id,
        ..
    } = &*data.get_ref();

    let state = generate_secure_random_string(20);
    _session.insert("oauth_state", &state).expect("Failed to set state");

    let github_oauth_url = generate_oauth_url(github_client_id.clone(), state);
    HttpResponse::Found()
        .append_header(("Location", github_oauth_url))
        .finish()
}

pub async fn github_oauth_redirect(
    web::Query(params): web::Query<HashMap<String, String>>,
    session: Session,
    data: web::Data<AppState>,
) -> impl Responder {
    let AppState {
        github_client_id,
        github_client_secret,
        ..
    } = &*data.get_ref();

    let received_state = match params.get("state") {
        Some(state) => state,
        None => return HttpResponse::BadRequest().body("Parameter error"),
    };

    let stored_state: String = session.get::<String>("oauth_state").unwrap_or_else(|_| None).unwrap_or_else(|| "".to_string());

    if stored_state != *received_state {
        return HttpResponse::BadRequest().body("Parameter error");
    }

    let code = match params.get("code") {
        Some(code) => code,
        None => return HttpResponse::BadRequest().body("Parameter error"),
    };

    let (github_user_id, github_user_name) =
        match exchange_code_for_user_id(github_client_id, github_client_secret, code).await {
            Ok(info) => info,
            Err(_) => {
                return HttpResponse::InternalServerError()
                    .body("Internal server error")
            }
        };

    if let Err(_) = session.insert("user_id", &github_user_id) {
        return HttpResponse::InternalServerError().body("Internal server error");
    }

    if let Err(_) = session.insert("user_name", &github_user_name) {
        return HttpResponse::InternalServerError().body("Internal server error");
    }

    HttpResponse::Found()
        .append_header(("Location", "/guestbook"))
        .finish()
}

pub async fn exchange_code_for_user_id(
    client_id: &str,
    client_secret: &str,
    code: &str,
) -> Result<(String, String), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code
        }))
        .send()
        .await?;

    let data: serde_json::Value = response.json().await?;
    let access_token = match data.get("access_token").and_then(serde_json::Value::as_str) {
        Some(token) => token,
        None => {
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Missing token",
            )))
        }
    };

    let response = client
        .get("https://api.github.com/user")
        .bearer_auth(access_token)
        .header("User-Agent", "rayspace.dev")
        .send()
        .await?;

    let data: serde_json::Value = response.json().await?;
    let user_id = match data.get("id").and_then(serde_json::Value::as_u64) {
        Some(id) => id.to_string(),
        None => {
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Missing user ID",
            )))
        }
    };

    let user_name = match data.get("name").and_then(serde_json::Value::as_str) {
        Some(name) => name.to_string(),
        None => {
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Missing user name",
            )))
        }
    };
    Ok((user_id, user_name))
}

fn generate_secure_random_string(length: usize) -> String {
    let rng = rand::rngs::OsRng; 
    rng.sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

pub fn generate_oauth_url(client_id: String, state: String) -> String {
    let redirect_uri = env::var("REDIRECT_URI").expect("Environment variable error");
    format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&state={}&scope=read:user%20user:email",
        client_id,
        redirect_uri,
        state
    )
}

pub async fn logout(session: Session) -> impl Responder {
    session.purge();
    HttpResponse::Ok().body("Logged out")
}
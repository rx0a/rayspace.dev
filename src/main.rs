mod auth;
mod services;
mod state;

use actix_files as fs;
use actix_session::CookieSession;
use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    http::{header::CACHE_CONTROL, HeaderValue},
    web, App, Error, HttpServer,
};
use auth::auth_routes;
use dotenv::dotenv;
use futures::future::{ok, Ready};
use hex;
use services::{
    create_comment, fetch_comments, fetch_posts, fetch_stars, update_views, user_status,
};
use sqlx::postgres::PgPoolOptions;
use state::AppState;
use std::env;

struct CacheControlMiddleware;

impl<S, B> Transform<S> for CacheControlMiddleware
where
    S: Service<Request = ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Request = ServiceRequest;
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = CacheControlMiddleware;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, _: S) -> Self::Future {
        ok(CacheControlMiddleware)
    }
}

impl<S, B> Service for CacheControlMiddleware
where
    S: Service<Request = ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Request = ServiceRequest;
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = S::Future;

    fn poll_ready(&self, service: &mut S) -> std::task::Poll<Result<(), Self::Error>> {
        service.poll_ready()
    }

    fn call(&self, mut service: ServiceRequest) -> Self::Future {
        let headers = service.headers_mut();
        headers.insert(
            CACHE_CONTROL,
            HeaderValue::from_static("max-age=86400"),
        );
        service.call(service.into_parts().0)
    }
}

async fn index() -> std::io::Result<fs::NamedFile> {
    fs::NamedFile::open("./assets/index.html")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(12)
        .connect(&database_url)
        .await
        .expect("Error building a connection pool");
    let github_client_id =
        env::var("GITHUB_CLIENT_ID").expect("Missing the GITHUB_CLIENT_ID environment variable.");
    let github_client_secret = env::var("GITHUB_CLIENT_SECRET")
        .expect("Missing the GITHUB_CLIENT_SECRET environment variable.");
    let secret_key_hex = env::var("SECRET_KEY").expect("SECRET_KEY must be set");
    let secret_key =
        hex::decode(secret_key_hex).expect("SECRET_KEY must be a hex-encoded byte array");
    let app_state = web::Data::new(AppState::new(github_client_id, github_client_secret, pool));

    HttpServer::new(move || {
        App::new()
            .wrap(CacheControlMiddleware)
            .wrap(
                CookieSession::private(&secret_key)
                    .secure(true)
                    .name("User"),
            )
            .app_data(app_state.clone())
            .service(auth_routes())
            .service(
                web::scope("/api")
                    .service(fetch_posts)
                    .service(fetch_comments)
                    .service(create_comment)
                    .service(update_views)
                    .service(user_status)
                    .service(fetch_stars),
            )
            .service(
                fs::Files::new("/", "./assets")
                    .index_file("index.html")
                    .use_last_modified(true),
            )
            .default_service(web::route().to(index))
    })
    .bind("0.0.0.0:3000")?
    .run()
    .await
}

use std::io::{self, Read};
fn main() {
    let mut source = String::new();
    let value = match io::stdin().read_to_string(&mut source) {
        Ok(_) => match serde_json::from_str(&source) {
            Ok(request) => statepack_runtime::request(&request),
            Err(e) => {
                serde_json::json!({"error":{"code":"INVALID_ARTIFACT","message":e.to_string()}})
            }
        },
        Err(e) => serde_json::json!({"error":{"code":"INVALID_ARTIFACT","message":e.to_string()}}),
    };
    println!("{}", value);
}

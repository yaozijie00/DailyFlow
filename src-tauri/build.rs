fn main() {
    tauri_build::build();

    // fixedRuntime 模式下应用要求「webview2」文件夹位于 exe 同目录。
    // 打包时由 bundler 自动部署；开发模式（debug）下 exe 在 target/debug，
    // 这里自动把 src-tauri/webview2 复制一份过去（仅缺失时复制一次），
    // 使 `npm run tauri dev` 与发布版行为一致。
    if std::env::var("PROFILE").as_deref() == Ok("debug") {
        let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR not set");
        // OUT_DIR = <target>/debug/build/<crate>-<hash>/out
        let target_dir = std::path::Path::new(&out_dir)
            .ancestors()
            .nth(4)
            .expect("resolve target dir");
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("webview2");
        let dst = target_dir.join("debug").join("webview2");
        if src.join("msedgewebview2.exe").exists() && !dst.join("msedgewebview2.exe").exists() {
            match copy_tree(&src, &dst) {
                Ok(()) => println!("cargo:warning=dev: fixed WebView2 runtime copied to {}", dst.display()),
                Err(e) => println!("cargo:warning=dev: failed to copy fixed WebView2 runtime: {e}"),
            }
        }
    }
}

fn copy_tree(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    if from.is_dir() {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            copy_tree(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        std::fs::copy(from, to)?;
        Ok(())
    }
}

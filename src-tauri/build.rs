use std::path::Path;

fn main() {
    let dist_react = Path::new("../dist-react");
    if dist_react.exists() {
        let target = Path::new("dist-react");
        if target.exists() {
            std::fs::remove_dir_all(target).ok();
        }
        copy_dir_recursive(dist_react, target).expect("Failed to copy dist-react");
        println!("cargo:warning=Copied dist-react to dist-react");
    }
    tauri_build::build()
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(&entry.path(), &dst_path)?;
        }
    }
    Ok(())
}
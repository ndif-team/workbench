import os
import modal

app = modal.App(name=os.environ.get("MODAL_APP_NAME", "interp-workbench"))
volume = modal.Volume.from_name("hf", create_if_missing=True)

image = (
    modal.Image.debian_slim()
    .uv_sync()
    .env({"CONFIG" : "dev",
          "HF_HOME": "/root/hf"}) # Configures which models are loaded
    .add_local_dir("./workbench/_api", remote_path="/root/workbench/_api", ignore=["__pycache__"])
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("ndif"), modal.Secret.from_name("hf")],
    scaledown_window=180,
    gpu="A100-80GB",
    volumes={"/root/hf": volume},
)
@modal.concurrent(max_inputs=50)
@modal.asgi_app()
def modal_app():
    from workbench._api.main import fastapi_app

    return fastapi_app()

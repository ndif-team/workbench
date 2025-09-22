import os
import modal

app = modal.App(name=os.environ.get("MODAL_APP_NAME", "interp-workbench"))

image = (
    modal.Image.debian_slim()
    .uv_sync()
    .env({"ENVIRONMENT" : os.environ.get("ENVIRONMENT", "dev"), 
          "INFLUXDB_BUCKET" : os.environ.get("INFLUXDB_BUCKET", "workbench-dev")
         }) # Configures which models are loaded
    .add_local_dir("./workbench/_api", remote_path="/root/workbench/_api", ignore=["__pycache__"])
)

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("ndif"), 
    modal.Secret.from_name("hf"),
    modal.Secret.from_name("influxdb")],
    scaledown_window=180
)
@modal.concurrent(max_inputs=50)
@modal.asgi_app()
def modal_app():
    from workbench._api.main import fastapi_app

    return fastapi_app()

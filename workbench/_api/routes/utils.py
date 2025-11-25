from ..state import APP_STATE

def fetch_job_results(model, job_id: str):
    backend = APP_STATE.make_backend(model=model, job_id=job_id)
    results = backend()

    return results

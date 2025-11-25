import requests, time, os, json
from typing import Dict


def poll_response(job_id: str):
    while True:
        response = requests.get(f"https://api.ndif.us/response/{job_id}")

        if response.status_code == 200:
            status = response.json()['status']
            if status == 'COMPLETED':
                return
            elif status == 'ERROR':
                raise Exception(response.json()['description'])
        else:
            raise Exception(f"Failed to get response for job {job_id}")

        time.sleep(1)


def request_tool(remote: bool, tool: str, visualization: str, body: Dict) -> Dict:
    response = requests.post(
        f"http://localhost:8000/{tool}/run", 
        headers={"X-User-Email": "test@test.com"}, 
        json=body
    )
    assert response.status_code == 200

    job_id = response.json()["job_id"]
    if remote:
        poll_response(job_id)
    
    response = requests.post(
        f"http://localhost:8000/{tool}/{visualization}/{job_id}", 
        headers={"X-User-Email": "test@test.com"}, 
        json=body
    )
    assert response.status_code == 200

    return response.json()


def get_expected_result(result_path: str) -> Dict:
    with open(os.path.join(os.path.dirname(__file__), "data", result_path+".json"), "r") as f:
        return json.load(f)

# service.py
import io, os
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from PIL import Image
import torch
from transformers import AutoImageProcessor, SiglipForImageClassification

MODEL_NAME = os.getenv("MODEL_NAME", "strangerguardhf/nsfw_image_detection")
NSFW_THRESHOLD = float(os.getenv("NSFW_THRESHOLD", "0.5"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Load 1 lần khi khởi động
model = SiglipForImageClassification.from_pretrained(MODEL_NAME).to(DEVICE).eval()
processor = AutoImageProcessor.from_pretrained(MODEL_NAME)

# fallback mapping như trong script cũ (nếu cần)
FALLBACK_ID2LABEL = {
    0: "Anime Picture",
    1: "Hentai",
    2: "Normal",
    3: "Pornography",
    4: "Enticing or Sensual",
}
id2label = {int(k): v for k, v in getattr(model.config, "id2label", FALLBACK_ID2LABEL).items()}

NSFW_LABELS = {"Hentai", "Pornography", "Enticing or Sensual"}

app = FastAPI(title="nsfw-image-detection", version="1.0")

class NSFWResp(BaseModel):
    is_nsfw: bool
    score: float
    top_label: str
    top_score: float
    probs: dict

@app.get("/health")
def health():
    return {"ok": True, "device": DEVICE, "labels": list(id2label.values())}

@app.post("/nsfw", response_model=NSFWResp)
async def nsfw(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file.")

    try:
        raw = await file.read()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file.")

    inputs = processor(images=img, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        logits = model(**inputs).logits
        probs = torch.nn.functional.softmax(logits, dim=1).squeeze(0).tolist()

    probs_dict = {id2label[i]: round(probs[i], 6) for i in range(len(probs))}
    # điểm NSFW = tổng các lớp NSFW
    nsfw_score = float(sum(probs_dict[l] for l in NSFW_LABELS if l in probs_dict))
    top_idx = int(torch.tensor(probs).argmax().item())
    top_label = id2label[top_idx]
    top_score = float(probs[top_idx])

    return {
        "is_nsfw": nsfw_score >= NSFW_THRESHOLD,
        "score": round(nsfw_score, 6),
        "top_label": top_label,
        "top_score": round(top_score, 6),
        "probs": probs_dict,
    }

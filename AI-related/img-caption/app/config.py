from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    blip_model_name: str = "Salesforce/blip-image-captioning-large"
    max_new_tokens: int = 60  # có thể chỉnh qua ENV

    # đọc .env nếu có
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

settings = Settings()

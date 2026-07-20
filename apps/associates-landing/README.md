# Hobby Atlas Landing

Amazon Associates 심사용으로 사용할 수 있는 최소 정적 큐레이션 페이지입니다.

## 로컬 확인

```powershell
docker compose up --build
```

브라우저에서 `http://localhost:8088`을 엽니다.

## 서버 배포

```powershell
docker build -t hobby-atlas .
docker run -d --name hobby-atlas --restart unless-stopped -p 8088:80 hobby-atlas
```

도메인 또는 리버스 프록시에서 `8088` 포트로 연결하면 됩니다.

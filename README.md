# 김경재 웹 포트폴리오

Unreal Engine 클라이언트 프로그래머의 경력과 기술 사례를 소개하는 정적 웹사이트입니다. GitHub Pages의 `/ProfilePage/` 경로에서 사용할 수 있도록 사이트 내부 경로는 상대 경로로 작성했습니다.

## 로컬 확인

저장소 루트에서 `python -m http.server 8000`을 실행한 뒤 `http://localhost:8000`을 엽니다. 빌드나 패키지 설치는 필요하지 않습니다. HTML 본문은 JavaScript 없이도 읽을 수 있습니다.

## 수정할 파일

- `index.html`: 소개, 개발 역량, 경력, 저널 기술 사례, 프로젝트, 활동과 연락처
- `assets/css/portfolio.css`: 반응형 레이아웃과 스타일
- `assets/js/portfolio.js`: 섹션 내비게이션, 상세 펼치기, 시연 모달과 이메일 복사
- `images/previews/`: 기존 이미지와 GIF에서 만든 정적 WebP 미리보기

GIF는 시연 버튼을 누른 뒤에만 불러옵니다. 새로운 시연을 추가할 때에는 미리보기 이미지와 `data-media`, `data-title`, 접근성 라벨을 함께 지정합니다.

이력서와 포트폴리오 PDF 버튼은 기존 사이트의 Google Drive 링크를 유지합니다. 이번에 제공된 PDF의 내용은 웹 본문에 반영했으며, Drive 파일의 내용이 최신인지 확인한 뒤 링크를 갱신할 수 있습니다.

## 참고와 원본 자료

정보 구조 참고: [이정석 포트폴리오](https://jsuk10.github.io/ProfilePage/) · [레퍼런스 저장소](https://github.com/jsuk10/ProfilePage)

이번 페이지의 HTML, CSS, JavaScript는 새로 작성했습니다. 기존 Hyperspace / HTML5 UP 기반 CSS, JavaScript와 Sass 파일은 보관되어 있으며 현재 페이지에서 불러오지 않습니다. 해당 원본 파일의 라이선스와 저작권 주석을 유지합니다.

프로젝트 소개의 날짜는 상세 포트폴리오를 기준으로 정리했습니다. No-Face 기간은 `2024.09.06 ~ 2024.12.04`, Black Space는 `2025.07.12 ~ 2025.08.22`를 사용합니다. 저널 사례는 추가 제공된 설명을 반영했으며, 확인된 UI 부수 효과는 해결 완료로 표시하지 않았습니다.

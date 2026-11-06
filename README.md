# 롯데렌터카 카드 동의서 웹앱

## 구조
- 태블릿: 「작성」 탭 → 동의서 입력 (카메라 스캔 + 서명)
- PC: 「목록·다운로드」 탭 → 실시간 확인 + CSV 다운로드
- 데이터는 구글 시트에 실시간 저장

## 설정 방법 (한 번만)

1. 구글 시트 열기  
   https://docs.google.com/spreadsheets/d/1-VpvKLnkqpkpVPz5xPAUUzxRFG5dfOZBjhbSLrrqwSQ

2. 확장 프로그램 → Apps Script

3. `Code.gs` 파일 내용을 전부 복사해서 붙여넣기 → 저장

4. 배포 → 새 배포 → 웹 앱
   - 실행 사용자: 나
   - 액세스 권한: 누구나
   - 배포

5. 나온 웹 앱 URL을 복사

6. `index.html`을 메모장으로 열어서  
   `const SCRIPT_URL = "여기에_URL_붙여넣기";`  
   부분을 복사한 URL로 바꾸기 → 저장 후 GitHub에 다시 push

## 사용
- GitHub Pages 활성화 후  
  https://handj1998-del.github.io/lotte-card-consent/ 
  주소로 접속하세요.
- 태블릿은 「작성」, PC는 「목록·다운로드」를 사용하세요.

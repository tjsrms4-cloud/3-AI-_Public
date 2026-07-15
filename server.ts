import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Ensure workspace root relative handling
const isProd = process.env.NODE_ENV === "production";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies with a generous size limit
  app.use(express.json({ limit: "10mb" }));

  // Helper to initialize Gemini client lazily to prevent crashing if key is missing
  function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      throw new Error(
        "GEMINI_API_KEY is not configured. Please set your Gemini API Key in the Settings > Secrets panel of AI Studio."
      );
    }
    return new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  // AI Distillation Endpoint
  app.post("/api/distill", async (req, res) => {
    try {
      const { rawText, meetingDate, meetingTitle } = req.body;

      if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
        res.status(400).json({ error: "회의록 텍스트를 입력해주세요." });
        return;
      }

      const refDate = meetingDate || new Date().toISOString().split("T")[0];
      const title = meetingTitle || "회의록";

      let ai;
      try {
        ai = getGeminiClient();
      } catch (err: any) {
        console.error("Gemini initialization error:", err.message);
        res.status(500).json({
          error: err.message,
          isConfigError: true,
        });
        return;
      }

      const systemInstruction = `
당신은 최고의 업무 생산성 분석 전문가이자 AI 회의록 분석기인 "TaskDistiller"입니다.
사용자가 입력한 줄글 형태의 회의록(회의 내용, 메모)을 분석하여 '담당자(Who)', '과업(What)', '마감기한(When)'을 정밀하게 추출하고 체계적으로 정리해야 합니다.

[분석 및 추론 규칙]
1. **회의 일자 기준**: 오늘/회의 일자는 "${refDate}"입니다. 회의록 내의 모든 상대적인 날짜 표현("내일", "이번주 금요일", "다음주 월요일", "모레", "어제" 등)은 이 기준 날짜(${refDate})를 기준으로 정확한 절대 날짜(YYYY-MM-DD)와 요일로 계산하여 변환하십시오.
   - 예: ${refDate}가 2026-07-14(화요일)일 때, "내일"은 2026-07-15(수요일), "다음주 월요일"은 2026-07-20(월요일)로 변환합니다.
2. **담당자 추론**: 명시적인 담당자가 없을 경우 문맥을 파악하여 추론하십시오.
   - 예: "마케팅 부서에서 광고 소재 기획을 진행하기로 함" -> 담당자: "마케팅팀"
   - 예: "길동님 제안서 검토 부탁해요" -> 담당자: "홍길동" (또는 문맥상 길동)
   - 담당자가 여전히 불명확하거나 전체 공통 업무라면 담당자를 "공통" 또는 "미지정"으로 분류하십시오.
3. **일정 혼선 방지 및 [확인 필요] 플래그**:
   - 담당자에게 일정이 겹치거나(예: 동일 날짜에 다수 중요 미팅/마감), 기한 표현이 지나치게 모호하여 임의 추론이 위험할 때, 또는 담당자 배정이 모호한 경우해당 할 일에 \`isUncertain: true\`를 설정하고 \`uncertaintyReason\`에 상세 내용을 작성하세요.
   - 이 경우 결과 텍스트의 해당 항목에도 "[확인 필요] (사유)" 형태로 표시되어야 합니다.
4. **의존성 파악**: 
   - 한 업무가 다른 업무의 선행 조건인 경우(예: "개발팀에서 API 명세서를 완료한 후, 마케팅팀에서 연동 테스트 진행")를 식별하여, \`dependencies\` 필드에 선행 업무의 요약 타이틀을 명시하고, 마감일 순서 및 인과 관계를 유지하십시오.
5. **중복 제거**:
   - 회의록 앞부분과 뒷부분에서 동일하거나 유사한 내용이 반복 언급될 경우, 분석 과정에서 하나로 병합하여 중복을 최소화하십시오.
6. **마감일이 없는 경우**: "우선순위 낮음", "장기 과제", "기한 미정" 등으로 정성적인 상대적 기한을 부여하고, YYYY-MM-DD를 알 수 없다면 \`normalizedDeadline\`은 공백 혹은 "기한 미정"으로 두되, \`formattedDeadlineText\`에는 정성적 표현을 기재하세요.

[출력 형식]
JSON 형식으로 반환해야 하며, 다음 스키마를 엄격히 준수하십시오.
JSON 형태 외에 다른 설명이나 서론, 백틱(markdown block)을 포함하지 마십시오. 오직 순수한 JSON 객체만 반환해야 합니다.

반환할 JSON 구조 예시:
{
  "meetingTitle": "회의 제목",
  "meetingDate": "YYYY-MM-DD",
  "groups": [
    {
      "assignee": "담당자 이름",
      "tasks": [
        {
          "title": "할 일 상세 내용 (예: 제안서 초안 작성)",
          "originalDeadline": "회의록에 적혀있던 본래 표현 (예: 다음주 월요일)",
          "normalizedDeadline": "YYYY-MM-DD 형식 (알 수 없으면 빈 문자열)",
          "formattedDeadlineText": "화면에 표시될 정돈된 기한 텍스트 (예: '07/20(월)' 또는 '기한 미정 (추후 논의)')",
          "isUncertain": true/false,
          "uncertaintyReason": "확인 필요 사유 (isUncertain이 true인 경우에만 작성)",
          "dependencies": ["선행 업무명 1", "선행 업무명 2"],
          "originalText": "회의록에서 추출된 원본 문장"
        }
      ]
    }
  ],
  "generalReviewNeeds": [
    {
      "type": "conflict | ambiguity | general",
      "description": "일정 충돌, 중복 우려, 또는 기한 누락 등 사용자가 직접 확인하고 재조정해야 할 전체적인 의견/이슈"
    }
  ],
  "rawMarkdownOutput": "복사/붙여넣기에 용이한 텍스트/마크다운 형식의 결과물 전체 스트링. (예시 포맷 준수)"
}

[rawMarkdownOutput 생성 가이드]
- 아래 형식처럼 담당자별로 그룹화하고, 마감일 순으로 나열하며, 확인 필요 사유 및 의존성 관계가 있다면 기재하십시오.
- 예시:
### [담당자: 홍길동]
- **07/20(월)**: 제안서 초안 작성 (원문 표현: 다음주 월요일)
- **07/25(토)**: 협력사 미팅 예약 [확인 필요] (미팅 장소 및 참석인원 조율 필요)

### [담당자: 김철수]
- **07/21(화)**: 예산안 검토 (선행: 홍길동 제안서 초안 작성 완료 후 진행)
`;

      const prompt = `
회의 제목: ${title}
회의 일자: ${refDate}
회의록 내용:
-------------------------
${rawText}
-------------------------

위 회의록 내용을 분석하여 JSON 구조로만 응답해 주세요. json 마크다운 백틱(\`\`\`json ... \`\`\`) 없이 순수 JSON 문자열로만 응답하세요.
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.1, // 낮춤으로써 분석의 일관성 및 정밀도 향상
        },
      });

      const responseText = response.text || "";
      let parsedData;
      try {
        parsedData = JSON.parse(responseText.trim());
      } catch (jsonErr) {
        console.error("JSON parsing error from Gemini response:", responseText);
        // Fallback or retry logic if parsing fails due to markdown wrappers
        const cleanText = responseText
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        parsedData = JSON.parse(cleanText);
      }

      res.json(parsedData);
    } catch (error: any) {
      console.error("Error during distillation:", error);
      res.status(500).json({ error: error.message || "서버 분석 오류가 발생했습니다." });
    }
  });

  // Serve static files in production, integrate Vite in development
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});

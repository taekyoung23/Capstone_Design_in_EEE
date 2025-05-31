// App.js
import React, { useState, useRef } from "react";
import axios from "axios";
import MathTextRenderer from "./MathTextRenderer";
import ReCAPTCHA from "react-google-recaptcha";

const API = process.env.REACT_APP_API_URL;

const subjects = [
  "객체지향프로그래밍","디지털논리회로","디지털시스템설계","멀티미디어",
  "자료구조론","컴퓨터네트워크","회로이론1","기계학습개론",
  "데이터베이스설계","신호및시스템","알고리즘설계","전자기학1",
  "정보보호론","확률변수"
];

// ① localStorage에서 user_id를 꺼내거나, 없으면 새로 만들어서 저장하는 함수
function getOrCreateUserId() {
  let userId = localStorage.getItem("user_id");
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem("user_id", userId);
  }
  return userId;
}

function App() {
  // 3.1. state 정의부
  const [pendingSubject, setPendingSubject] = useState("");    // (추가) CAPTCHA 대기 중인 과목
  const [verifiedSubject, setVerifiedSubject] = useState("");  // (추가) 인증 완료된 과목

  const [questionCount, setQuestionCount] = useState(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [modelA, setModelA] = useState(null);
  const [modelB, setModelB] = useState(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quizExhausted, setQuizExhausted] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);

  // ② reCAPTCHA 토큰을 담을 state
  const [recaptchaToken, setRecaptchaToken] = useState("");
  // reCAPTCHA 위젯을 리셋하거나 토큰을 가져오기 위해 ref를 사용
  const recaptchaRef = useRef(null);

  // ③ 과목 선택 + 문제 요청 (compare_models) → 헤더에 X-User-Id 포함, 바디에 recaptcha_token 포함
  const handleSubjectSelect = async (subject) => {
    setLoading(true);
    setError("");
    setQuizExhausted(false);

    try {
      const userId = getOrCreateUserId();
      const res = await axios.post(
        `${API}/compare_models/`,
        {
          subject,
          recaptcha_token: recaptchaToken, // CAPTCHA 토큰을 서버로 전송
        },
        {
          headers: { "X-User-Id": userId },
        }
      );

      // 성공 시 CAPTCHA도 리셋(만료 방지)
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
      }
      setRecaptchaToken("");

      setSelectedSubject(subject);
      setSessionId(res.data.session_id);
      setSelectedIdx(res.data.idx);

      // 랜덤 섞기
      const shouldSwap = Math.random() < 0.5;
      if (shouldSwap) {
        setModelA(res.data.model_b);
        setModelB(res.data.model_a);
        setIsSwapped(true);
      } else {
        setModelA(res.data.model_a);
        setModelB(res.data.model_b);
        setIsSwapped(false);
      }
    } catch (err) {
      console.error(err);
      if (err.response?.status === 404) {
        setSelectedSubject("");
        setQuizExhausted(true);
      } else if (err.response?.status === 400) {
        // CAPTCHA 인증 실패
        setError("🔴 CAPTCHA 인증에 실패했습니다. 새로 인증해주세요.");
        if (recaptchaRef.current) recaptchaRef.current.reset();
        setRecaptchaToken("");
      } else {
        setError("문제 생성에 실패했습니다. 콘솔을 확인해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  // 3.4. CAPTCHA 통과 후 상태 변경
  const onCaptchaVerify = () => {
    if (!recaptchaToken || !pendingSubject) return;

    // 과목당 한 번만 CAPTCHA를 풀도록 표시
    setVerifiedSubject(pendingSubject);
    // 문제 수 선택 화면으로 넘어가기 위해 selectedSubject 설정
    setSelectedSubject(pendingSubject);

    // CAPTCHA 위젯 리셋
    if (recaptchaRef.current) {
      recaptchaRef.current.reset();
    }
    setRecaptchaToken("");
  };

  // ④ 문제 수 선택
  const handleQuestionCountSelect = (count) => {
    setQuestionCount(count);
    setAnsweredCount(1);
    handleSubjectSelect(selectedSubject);
  };

  // ⑤ 모델 A/B 선택 저장 (save_selection) → 반드시 헤더에 X-User-Id 포함
  const handleModelSelect = async (which) => {
    if (!sessionId || selectedIdx === null) return;
    setLoading(true);
    setError("");

    try {
      const realModel = which === "A"
        ? (isSwapped ? "model_b" : "model_a")
        : (isSwapped ? "model_a" : "model_b");

      const userId = getOrCreateUserId();
      await axios.post(
        `${API}/save_selection/`,
        {
          session_id: sessionId,
          subject: selectedSubject,
          idx: selectedIdx,
          selected_model: realModel,
        },
        {
          headers: { "X-User-Id": userId },
        }
      );

      setSelectedModel(which);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 429) {
        const remainRaw = err.response.headers["x-block-remaining"];

        if (remainRaw === "600") {
          // ✅ 블랙리스트에 올라간 경우 (10분 차단)
          setError("⚠️ 과도한 요청으로 인해 10분 동안 차단되었습니다.");
        } else {
          // ✅ 일반적인 속도 제한 (20회/1분)
          setError("⚠️ 너무 많은 요청을 보냈습니다. 1분 후 다시 시도하세요.");
        }
      } else {
        setError("모델 선택 저장에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ⑥ 피드백 전송 (submit_feedback) → 헤더에 X-User-Id 포함
  const handleFeedbackSubmit = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError("");

    try {
      const userId = getOrCreateUserId();
      await axios.post(
        `${API}/submit_feedback/`,
        {
          session_id: sessionId,
          feedback,
        },
        {
          headers: { "X-User-Id": userId },
        }
      );
      alert("피드백이 성공적으로 저장되었습니다!");
    } catch (err) {
      console.error(err);
      setError("피드백 제출에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App" style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>LLM Quiz Comparison</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>로딩중...</p>}

      {/* 3.3. CAPTCHA 위젯 노출 조건 변경 */}
      {pendingSubject && verifiedSubject !== pendingSubject && !quizExhausted && (
        <div style={{ marginBottom: 20 }}>
          <ReCAPTCHA
            ref={recaptchaRef}
            sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
            onChange={(token) => {
              setRecaptchaToken(token);
              setError("");
            }}
          />
          <button
            onClick={onCaptchaVerify}
            style={{
              marginTop: 8,
              padding: "8px 16px",
              background: "#1976d2",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            ✅ 인증 완료
          </button>
          <p style={{ color: "#888", fontSize: "0.9em", marginTop: 4 }}>
            🔐 "{pendingSubject}" 과목을 풀려면 먼저 CAPTCHA 인증이 필요합니다.
          </p>
        </div>
      )}

      {/* 과목 선택 화면 */}
      {!selectedSubject && !quizExhausted && (
        <section>
          <h2>🔍 과목을 선택하세요</h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "center",
            }}
          >
            {subjects.map((subj) => (
              <button
                key={subj}
                onClick={() => {
                  // 이미 인증된 과목인지 확인
                  if (verifiedSubject === subj) {
                    // 이미 인증되었으면 바로 문제 수 선택 단계로 넘어가기
                    setSelectedSubject(subj);
                    setPendingSubject("");
                    setError("");
                  } else {
                    // 아직 인증되지 않은 과목이라면 pendingSubject 설정 → CAPTCHA로 이동
                    setPendingSubject(subj);
                    setError("");
                  }
                }}
                style={{
                  padding: "8px 16px",
                  margin: 4,
                  backgroundColor: "#444",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                {subj}
                {verifiedSubject === subj && (
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      color: "#4caf50",
                      fontSize: "14px",
                    }}
                  >
                    ✔
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 문제 수 선택 */}
      {selectedSubject && questionCount === null && (
        <section style={{ marginTop: 32 }}>
          <button
            onClick={() => {
              // 과목 선택 화면으로 돌아가기
              setSelectedSubject("");
              setPendingSubject("");
              setQuestionCount(null);
              setAnsweredCount(0);
              if (recaptchaRef.current) {
                recaptchaRef.current.reset();
                setRecaptchaToken("");
              }
            }}
            style={{
              marginBottom: 12,
              background: "transparent",
              border: "none",
              color: "#61dafb",
              cursor: "pointer",
            }}
          >
            ⬅️ 과목 선택으로 돌아가기
          </button>
          <h2>🔢 "{selectedSubject}" 과목의 문제 수를 선택하세요</h2>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {[5, 10].map((n) => (
              <button
                key={n}
                onClick={() => handleQuestionCountSelect(n)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#444",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {n}문제
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 모델 비교 화면 */}
      {selectedSubject && modelA && modelB && !selectedModel && (
        <section style={{ marginTop: 24 }}>
          <button
            onClick={() => {
              setSelectedSubject("");
              setPendingSubject("");
              setAnsweredCount(1);
              if (recaptchaRef.current) {
                recaptchaRef.current.reset();
                setRecaptchaToken("");
              }
            }}
            style={{
              marginBottom: 12,
              background: "transparent",
              border: "none",
              color: "#61dafb",
              cursor: "pointer",
            }}
          >
            ⬅️ 과목 선택으로 돌아가기
          </button>

          <div style={{ display: "flex", gap: 16 }}>
            {[{ label: "A", data: modelA }, { label: "B", data: modelB }].map(
              ({ label, data }) => (
                <div
                  key={label}
                  style={{
                    flex: 1,
                    background: "#333",
                    padding: 16,
                    borderRadius: 6,
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -10,
                      left: 16,
                      background: "#333",
                      padding: "2px 8px",
                      fontWeight: "bold",
                      borderRadius: 4,
                    }}
                  >
                    Model {label}
                  </div>
                  <p style={{ color: "#ddd", margin: 0 }}>
                    <MathTextRenderer text={data.question} />
                  </p>
                  {data.choices.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        margin: 0,
                        color: "#ccc",
                        gap: "4px",
                      }}
                    >
                      <span>{i + 1}.</span>
                      <span style={{ display: "inline" }}>
                        <MathTextRenderer text={c} />
                      </span>
                    </div>
                  ))}
                  <p style={{ color: "#66ff66", marginTop: 8 }}>
                    <strong>정답:</strong> {data.answer}
                  </p>
                  <div
                    style={{
                      background: "#222",
                      color: "#99ccff",
                      padding: 8,
                      marginTop: 4,
                      borderRadius: 4,
                      maxHeight: 100,
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <strong>해설:</strong>
                    <MathTextRenderer text={data.explanation} />
                  </div>
                  <button
                    onClick={() => handleModelSelect(label)}
                    style={{
                      marginTop: 12,
                      width: "100%",
                      padding: 10,
                      background: "#4caf50",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Select Model {label}
                  </button>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* 선택된 모델 화면 */}
      {selectedModel && (
        <section style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <button
              onClick={() => setSelectedModel("")}
              style={{
                background: "transparent",
                border: "none",
                color: "#61dafb",
                cursor: "pointer",
              }}
            >
              ⬅️ 비교 화면으로 돌아가기
            </button>
            <button
              onClick={() => {
                setSelectedSubject("");
                setPendingSubject("");
                setVerifiedSubject("");
                setSelectedModel("");
                setQuestionCount(null);
                setAnsweredCount(0);
                setModelA(null);
                setModelB(null);
                setSessionId(null);
                setSelectedIdx(null);
                setFeedback("");
                if (recaptchaRef.current) {
                  recaptchaRef.current.reset();
                  setRecaptchaToken("");
                }
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#61dafb",
                cursor: "pointer",
              }}
            >
              🏠 과목 선택으로 돌아가기
            </button>
            <span>✅ 비교 완료한 문제 수: {answeredCount}/{questionCount}</span>
          </div>

          <h2>✅ 선택된 모델: Model {selectedModel}</h2>
          <p style={{ color: "#000", margin: 0 }}>
            <MathTextRenderer
              text={selectedModel === "A" ? modelA.question : modelB.question}
            />
          </p>

          {(selectedModel === "A" ? modelA.choices : modelB.choices).map((c, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                margin: 0,
                color: "#000",
                gap: "4px",
              }}
            >
              <span>{i + 1}.</span>
              <span style={{ display: "inline" }}>
                <MathTextRenderer text={c} />
              </span>
            </div>
          ))}

          <p style={{ color: "#66ff66", marginTop: 12 }}>
            정답: {selectedModel === "A" ? modelA.answer : modelB.answer}
          </p>
          <p style={{ color: "#000" }}>
            해설:{" "}
            <MathTextRenderer
              text={selectedModel === "A" ? modelA.explanation : modelB.explanation}
            />
          </p>

          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="추가 피드백을 입력하세요(예시: 답과 해설이 맞지 않음, 논리적으로 문제가 있음, 모델이 환각 증상을 보임, 보기의 변별력이 낮음)"
            style={{
              width: "100%",
              height: 100,
              marginTop: 12,
              padding: 10,
              borderRadius: 4,
              border: "1px solid #555",
              background: "#222",
              color: "#fff",
            }}
          />
          <button
            onClick={handleFeedbackSubmit}
            style={{
              marginTop: 12,
              padding: "10px 20px",
              background: "#4caf50",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            피드백 제출
          </button>
          <button
            onClick={() => {
              if (answeredCount + 1 > questionCount) {
                alert(`${questionCount}문제를 모두 확인하셨습니다!`);
                return;
              }
              setAnsweredCount((prev) => prev + 1);
              setSelectedModel("");
              setFeedback("");
              handleSubjectSelect(selectedSubject);
            }}
            style={{
              marginTop: 12,
              marginLeft: 12,
              padding: "10px 20px",
              background: "#2196f3",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            다음 문제 풀기
          </button>
        </section>
      )}
    </div>
  );
}

export default App;

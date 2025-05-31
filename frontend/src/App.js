//============================================================================
// App.js (수정된 코드 예시)
//============================================================================
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

// localStorage에서 user_id를 꺼내거나, 없으면 새로 만들어서 저장하는 함수
function getOrCreateUserId() {
  let userId = localStorage.getItem("user_id");
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem("user_id", userId);
  }
  return userId;
}

function App() {
  // ── 1) state 정의부 ──────────────────────────────────────────────
  const [pendingSubject, setPendingSubject] = useState("");    // CAPTCHA 대기 중인 과목
  const [verifiedSubject, setVerifiedSubject] = useState("");  // CAPTCHA 인증 완료된 과목

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
  // reCAPTCHA 위젯을 리셋하려고 ref 사용
  const recaptchaRef = useRef(null);

  //───────────────────────────────────────────────────────────────────────────

  // ── 2) 실제 문제 요청 함수(handleSubjectSelect) ─────────────────────────
  // 이 함수는 “유효한 recaptchaToken”을 받아서 서버에 보내고, 문제를 가져옵니다.
  const handleSubjectSelect = async (subject, count /* ← 나중에 사용할 문제 개수 */) => {
    setLoading(true);
    setError("");
    setQuizExhausted(false);

    try {
      const userId = getOrCreateUserId();
      // 서버 호출 시점에 recaptchaToken 여전히 살아 있음
      const res = await axios.post(
        `${API}/compare_models/`,
        {
          subject,
          recaptcha_token: recaptchaToken,
          question_count: count   // 서버가 “몇 문제” 요청받았는지 알게 하려면
        },
        {
          headers: { "X-User-Id": userId },
          // (타임아웃 옵션은 별도 설정 안 해도 무한대로 동작)
        }
      );

      // ① 문제 생성(응답) 성공 시 reCAPTCHA 위젯 리셋
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
      }
      // ② recaptchaToken 초기화
      setRecaptchaToken("");

      // ③ 응답받은 문제 데이터를 화면에 띄울 수 있도록 저장
      setSelectedSubject(subject);
      setSessionId(res.data.session_id);
      setSelectedIdx(res.data.idx);

      // 모델 A/B 랜덤 섞기
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
        // 문제 소진 혹은 잠김
        setSelectedSubject("");
        setQuizExhausted(true);
      } else if (err.response?.status === 400) {
        // CAPTCHA 인증 실패
        setError("🔴 CAPTCHA 인증에 실패했습니다. 다시 인증해주세요.");
        if (recaptchaRef.current) recaptchaRef.current.reset();
        setRecaptchaToken("");
      } else {
        setError("문제 생성에 실패했습니다. 콘솔을 확인해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── 3) CAPTCHA를 풀고 ‘인증 완료’ 버튼을 눌렀을 때 호출되는 함수 ────────────
  const onCaptchaVerify = () => {
    // (1) recaptchaToken이 비어 있거나, pendingSubject가 없으면 리턴
    if (!recaptchaToken || !pendingSubject) {
      setError("🔴 먼저 CAPTCHA를 완료해 주세요.");
      return;
    }

    // (2) 이 과목을 인증된 상태로 표시
    setVerifiedSubject(pendingSubject);

    // (3) 문제 수를 미리 설정했다면(예: 5문제/10문제), 
    //     그 카운트를 같이 넘겨서 곧바로 handleSubjectSelect를 호출
    //    → 만약 “문제 수 선택” 화면을 먼저 보여주고 그 다음 API 호출하고 싶으면 
    //       이 부분을 분리해서 단계별로 구현해야 합니다!
    //
    //    여기 예시에서는, 사용자가 먼저 “5문제/10문제”를 고르도록 UI를 나눠 놓았으니
    //    onCaptchaVerify 시점에서는 아직 count가 정해져 있지 않습니다.
    //    따라서 “인증 완료” 이후에는 문제 수 선택 UI로 이동만 시키고, 
    //    실제 서버 호출(handleSubjectSelect)은 문제 수 버튼에서 하기로 합니다.
    //
    setSelectedSubject(pendingSubject);
    // recaptchaToken은 아직 살아 있으므로, 나중에 handleQuestionCountSelect에서 써먹는다.

    // (4) reCAPTCHA 위젯은 풀린 상태지만, 굳이 직접 리셋할 필요는 없습니다.
    //     서버 호출 시에 `reset()` 하고, token도 비웁니다.
    // if (recaptchaRef.current) {
    //   recaptchaRef.current.reset();
    // }
    // setRecaptchaToken("");
  };

  // ── 4) 문제 수 선택(5문제/10문제) 버튼 클릭 시 호출 ────────────────────────
  const handleQuestionCountSelect = (count) => {
    setQuestionCount(count);
    setAnsweredCount(1);

    // 이제 onCaptchaVerify 단계에서 recaptchaToken이 유효하게 살아 있으므로,
    // subject와 count를 같이 넘겨서 실제로 서버 요청을 보냅니다.
    handleSubjectSelect(selectedSubject, count);
  };

  // ── 5) 모델 선택 저장 (save_selection) ─────────────────────────────────
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
          setError("⚠️ 과도한 요청으로 인해 10분 동안 차단되었습니다.");
        } else {
          setError("⚠️ 너무 많은 요청을 보냈습니다. 1분 후 다시 시도하세요.");
        }
      } else {
        setError("모델 선택 저장에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── 6) 피드백 전송 (submit_feedback) ────────────────────────────────────
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

  // ── 7) 렌더링 부분 ─────────────────────────────────────────────────────
  return (
    <div className="App" style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>LLM Quiz Comparison</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>로딩중...</p>}

      {/*───────────────────────────────────────────────────────*/}
      {/* 3.3. CAPTCHA 위젯 노출 조건 */}
      {pendingSubject && verifiedSubject !== pendingSubject && !quizExhausted && (
        <div style={{ marginBottom: 20 }}>
          <ReCAPTCHA
            ref={recaptchaRef}
            sitekey="6Lfe0FArAAAAAEHkBABER_UnPKtSczXTRAtV0Tkw"
            onChange={(token) => {
              setRecaptchaToken(token);
              setError("");
            }}
            onExpired={() => {
              setRecaptchaToken("");
              setError("🔴 토큰이 만료되었습니다. 다시 인증해주세요.");
            }}
            onErrored={() => {
              setRecaptchaToken("");
              setError("🔴 reCAPTCHA 로딩에 실패했습니다. 잠시 후 다시 시도해주세요.");
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

      {/*───────────────────────────────────────────────────────*/}
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
                  if (verifiedSubject === subj) {
                    // 이미 인증된 과목은 바로 문제 수 선택으로
                    setSelectedSubject(subj);
                    setPendingSubject("");
                    setError("");
                  } else {
                    // 인증되지 않은 과목이면 pendingSubject → reCAPTCHA 단계로
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

      {/*───────────────────────────────────────────────────────*/}
      {/* 문제 수 선택 (인증된 selectedSubject에 대해서만 노출) */}
      {selectedSubject && questionCount === null && (
        <section style={{ marginTop: 32 }}>
          <button
            onClick={() => {
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

      {/*───────────────────────────────────────────────────────*/}
      {/* 모델 비교 화면 */}
      {selectedSubject && modelA && modelB && !selectedModel && (
        <section style={{ marginTop: 24 }}>
          {/* “과목 선택으로 돌아가기” */}
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

      {/*───────────────────────────────────────────────────────*/}
      {/* 선택된 모델 화면 */}
      {selectedModel && (
        <section style={{ marginTop: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
            }}
          >
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
            <span>
              ✅ 비교 완료한 문제 수: {answeredCount}/{questionCount}
            </span>
          </div>

          <h2>✅ 선택된 모델: Model {selectedModel}</h2>
          <p style={{ color: "#000", margin: 0 }}>
            <MathTextRenderer
              text={selectedModel === "A" ? modelA.question : modelB.question}
            />
          </p>

          {(selectedModel === "A" ? modelA.choices : modelB.choices).map(
            (c, i) => (
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
            )
          )}

          <p style={{ color: "#66ff66", marginTop: 12 }}>
            정답: {selectedModel === "A" ? modelA.answer : modelB.answer}
          </p>
          <p style={{ color: "#000" }}>
            해설:{" "}
            <MathTextRenderer
              text={
                selectedModel === "A"
                  ? modelA.explanation
                  : modelB.explanation
              }
            />
          </p>

          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="추가 피드백을 입력하세요(예시: 답과 해설이 맞지 않음, 논리적 오류, 환각 증상을 보임 등)"
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
              handleSubjectSelect(selectedSubject, questionCount);
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


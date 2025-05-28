import { MathJax, MathJaxContext } from "better-react-mathjax";

const config = {
  loader: { load: ["input/tex", "output/chtml"] },
};

export default function MathTextRenderer({ text }) {
  const isLatex = /\$.*\\.*\$/.test(text); // 예: $-\infty < x < \infty$

  return (
    <MathJaxContext config={config}>
      {isLatex ? <MathJax dynamic>{text}</MathJax> : <div>{text}</div>}
    </MathJaxContext>
  );
}

"use client";
import { useState } from "react";
import {
    Sparkles, CheckCircle2, XCircle, RotateCw,
    Pencil, Trash2, Plus, Save, X, GripVertical,
} from "lucide-react";

type QuizQuestion = {
    question: string;
    options: string[];
    answer: number;
    explanation: string;
};

export default function QuizPanel({
    jobId,
    initialQuiz,
}: {
    jobId: string;
    initialQuiz: QuizQuestion[] | null;
}) {
    const [quiz, setQuiz] = useState<QuizQuestion[] | null>(initialQuiz);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selected, setSelected] = useState<Record<number, number>>({});
    const [revealed, setRevealed] = useState<Record<number, boolean>>({});
    const [error, setError] = useState("");
    const [editMode, setEditMode] = useState(false);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [draft, setDraft] = useState<QuizQuestion | null>(null);

    const generateQuiz = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/video/generate-quiz", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setQuiz(data.quiz);
            setSelected({});
            setRevealed({});
            setEditMode(false);
            setEditingIdx(null);
        } catch (e: unknown) {
            setError((e as Error).message || "Lỗi sinh quiz");
        } finally {
            setLoading(false);
        }
    };

    // ── Save quiz to DB ──────────────────────────────────────────────────
    const saveQuiz = async () => {
        if (!quiz) return;
        setSaving(true);
        try {
            const res = await fetch("/api/video/generate-quiz", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId, quizData: quiz }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setEditMode(false);
            setEditingIdx(null);
        } catch (e: unknown) {
            setError((e as Error).message || "Lỗi lưu quiz");
        } finally {
            setSaving(false);
        }
    };

    // ── Edit helpers ─────────────────────────────────────────────────────
    const startEdit = (idx: number) => {
        setEditingIdx(idx);
        setDraft({ ...quiz![idx], options: [...quiz![idx].options] });
    };

    const cancelEdit = () => {
        setEditingIdx(null);
        setDraft(null);
    };

    const saveEdit = () => {
        if (!draft || editingIdx === null || !quiz) return;
        const updated = [...quiz];
        updated[editingIdx] = draft;
        setQuiz(updated);
        setEditingIdx(null);
        setDraft(null);
    };

    const deleteQuestion = (idx: number) => {
        if (!quiz) return;
        const updated = quiz.filter((_, i) => i !== idx);
        setQuiz(updated.length > 0 ? updated : null);
        // Reset answers
        setSelected({});
        setRevealed({});
    };

    const addQuestion = () => {
        const newQ: QuizQuestion = {
            question: "Câu hỏi mới?",
            options: ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
            answer: 0,
            explanation: "",
        };
        setQuiz(quiz ? [...quiz, newQ] : [newQ]);
        // Auto-open editor for the new question
        setEditingIdx(quiz ? quiz.length : 0);
        setDraft({ ...newQ, options: [...newQ.options] });
    };

    const handleSelect = (qIdx: number, oIdx: number) => {
        if (revealed[qIdx] || editMode) return;
        setSelected((p) => ({ ...p, [qIdx]: oIdx }));
    };

    const handleReveal = (qIdx: number) => {
        setRevealed((p) => ({ ...p, [qIdx]: true }));
    };

    // ── Empty state ──────────────────────────────────────────────────────
    if (!quiz) {
        return (
            <div className="text-center py-12">
                <Sparkles className="w-12 h-12 text-brand-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Sinh câu hỏi ôn tập bằng AI
                </h3>
                <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                    AI sẽ tạo 5 câu hỏi trắc nghiệm từ nội dung bài giảng để sinh viên ôn tập.
                </p>
                {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
                <button
                    onClick={generateQuiz}
                    disabled={loading}
                    className="btn-primary inline-flex items-center gap-2"
                >
                    {loading ? (
                        <><RotateCw className="w-4 h-4 animate-spin" /> Đang sinh câu hỏi...</>
                    ) : (
                        <><Sparkles className="w-4 h-4" /> Sinh câu hỏi AI</>
                    )}
                </button>
            </div>
        );
    }

    const totalAnswered = Object.keys(revealed).length;
    const totalCorrect = Object.entries(revealed).filter(
        ([qIdx]) => selected[Number(qIdx)] === quiz[Number(qIdx)]?.answer
    ).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800">
                        📝 Câu hỏi ôn tập ({quiz.length} câu)
                    </h3>
                    {!editMode && totalAnswered > 0 && (
                        <p className="text-sm text-gray-500 mt-1">
                            Kết quả: {totalCorrect}/{totalAnswered} đúng
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {editMode ? (
                        <>
                            <button
                                onClick={addQuestion}
                                className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-50 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" /> Thêm câu
                            </button>
                            <button
                                onClick={saveQuiz}
                                disabled={saving}
                                className="text-sm text-white bg-brand-600 hover:bg-brand-700 flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                {saving ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Lưu
                            </button>
                            <button
                                onClick={() => { setEditMode(false); setEditingIdx(null); setDraft(null); }}
                                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" /> Hủy
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => { setEditMode(true); setSelected({}); setRevealed({}); }}
                                className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                                <Pencil className="w-3.5 h-3.5" /> Chỉnh sửa
                            </button>
                            <button
                                onClick={generateQuiz}
                                disabled={loading}
                                className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1"
                            >
                                <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                                Sinh lại
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            {/* Questions */}
            {quiz.map((q, qIdx) => (
                <div
                    key={qIdx}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 relative"
                >
                    {/* Edit mode: inline editor */}
                    {editMode && editingIdx === qIdx && draft ? (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Câu hỏi</label>
                                <input
                                    type="text"
                                    value={draft.question}
                                    onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-500 block">Đáp án (click radio để chọn đáp án đúng)</label>
                                {draft.options.map((opt, oIdx) => (
                                    <div key={oIdx} className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name={`answer-${qIdx}`}
                                            checked={draft.answer === oIdx}
                                            onChange={() => setDraft({ ...draft, answer: oIdx })}
                                            className="accent-brand-500"
                                        />
                                        <span className="text-xs font-medium text-gray-400 w-5">{String.fromCharCode(65 + oIdx)}.</span>
                                        <input
                                            type="text"
                                            value={opt}
                                            onChange={(e) => {
                                                const newOpts = [...draft.options];
                                                newOpts[oIdx] = e.target.value;
                                                setDraft({ ...draft, options: newOpts });
                                            }}
                                            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                                        />
                                        {draft.options.length > 2 && (
                                            <button
                                                onClick={() => {
                                                    const newOpts = draft.options.filter((_, i) => i !== oIdx);
                                                    const newAnswer = draft.answer >= newOpts.length ? 0 : (draft.answer > oIdx ? draft.answer - 1 : draft.answer);
                                                    setDraft({ ...draft, options: newOpts, answer: newAnswer });
                                                }}
                                                className="text-red-400 hover:text-red-600 p-1"
                                                title="Xóa đáp án"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {draft.options.length < 6 && (
                                    <button
                                        onClick={() => setDraft({ ...draft, options: [...draft.options, `Đáp án ${String.fromCharCode(65 + draft.options.length)}`] })}
                                        className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 mt-1"
                                    >
                                        <Plus className="w-3 h-3" /> Thêm đáp án
                                    </button>
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Giải thích</label>
                                <input
                                    type="text"
                                    value={draft.explanation}
                                    onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                                    placeholder="Giải thích ngắn..."
                                />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={saveEdit} className="text-sm bg-brand-600 text-white px-4 py-1.5 rounded-lg hover:bg-brand-700 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Xong
                                </button>
                                <button onClick={cancelEdit} className="text-sm text-gray-500 px-4 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                                    Hủy
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Edit mode action buttons */}
                            {editMode && editingIdx !== qIdx && (
                                <div className="absolute top-3 right-3 flex items-center gap-1">
                                    <button
                                        onClick={() => startEdit(qIdx)}
                                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                                        title="Sửa câu hỏi"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => deleteQuestion(qIdx)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Xóa câu hỏi"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}

                            <p className="font-medium text-gray-800 mb-4">
                                {editMode && <GripVertical className="w-4 h-4 inline text-gray-300 mr-1" />}
                                <span className="text-brand-600 font-bold">Câu {qIdx + 1}.</span>{" "}
                                {q.question}
                            </p>

                            <div className="space-y-2">
                                {q.options.map((opt, oIdx) => {
                                    const isSelected = selected[qIdx] === oIdx;
                                    const isRevealed = revealed[qIdx];
                                    const isCorrect = q.answer === oIdx;

                                    let cls = "w-full text-left p-3 rounded-lg border text-sm transition-all ";
                                    if (editMode) {
                                        cls += isCorrect
                                            ? "border-green-300 bg-green-50/50 text-green-800"
                                            : "border-gray-100 text-gray-500";
                                    } else if (isRevealed) {
                                        cls += isCorrect
                                            ? "border-green-400 bg-green-50 text-green-800"
                                            : isSelected && !isCorrect
                                                ? "border-red-400 bg-red-50 text-red-800"
                                                : "border-gray-100 text-gray-400";
                                    } else if (isSelected) {
                                        cls += "border-brand-400 bg-brand-50 text-brand-800";
                                    } else {
                                        cls += "border-gray-200 text-gray-700 hover:border-brand-300 hover:bg-gray-50 cursor-pointer";
                                    }

                                    return (
                                        <button
                                            key={oIdx}
                                            className={cls}
                                            onClick={() => handleSelect(qIdx, oIdx)}
                                            disabled={isRevealed || editMode}
                                        >
                                            <span className="font-medium mr-2">{String.fromCharCode(65 + oIdx)}.</span>
                                            {opt}
                                            {editMode && isCorrect && <CheckCircle2 className="w-4 h-4 inline ml-2 text-green-500" />}
                                            {!editMode && isRevealed && isCorrect && <CheckCircle2 className="w-4 h-4 inline ml-2 text-green-600" />}
                                            {!editMode && isRevealed && isSelected && !isCorrect && <XCircle className="w-4 h-4 inline ml-2 text-red-500" />}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Check answer */}
                            {!editMode && selected[qIdx] !== undefined && !revealed[qIdx] && (
                                <button
                                    onClick={() => handleReveal(qIdx)}
                                    className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium"
                                >
                                    Kiểm tra đáp án →
                                </button>
                            )}

                            {/* Explanation */}
                            {!editMode && revealed[qIdx] && q.explanation && (
                                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <p className="text-sm text-blue-800">
                                        <span className="font-medium">💡 Giải thích:</span> {q.explanation}
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}

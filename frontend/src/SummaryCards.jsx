import React from "react";

export default function SummaryCards({ summary }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* summary を元にカード表示 */}
      <div className="bg-white p-4 rounded shadow">ユーザー数: {summary.totalUsers}</div>
      <div className="bg-white p-4 rounded shadow">企業数: {summary.totalCompanies}</div>
      <div className="bg-white p-4 rounded shadow">レポート数: {summary.totalReports}</div>
      <div className="bg-white p-4 rounded shadow">未対応: {summary.newReports}</div>
    </div>
  );
}

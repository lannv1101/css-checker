import React, { useState, useMemo, useCallback } from "react";
import Head from "next/head";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Download } from "lucide-react";
import * as XLSX from "xlsx";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Types
interface UnusedRule {
  selector: string;
  used: boolean;
  bytes: number;
}

interface FileResult {
  url: string;
  total: number;
  used: number;
  unusedRules: UnusedRule[];
}

interface AnalysisResult {
  totalBytes: number;
  usedBytes: number;
  usagePercent: number;
  files: FileResult[];
}

// Components
const StatsCard = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <div className="p-4 bg-gray-50 rounded-lg">
    <p className="text-sm text-gray-600">{label}</p>
    <p className="text-xl font-bold">{value}</p>
  </div>
);

const FileDetails = ({ file, index }: { file: FileResult; index: number }) => {
  const usagePercentage = useMemo(
    () => ((file.used / file.total) * 100).toFixed(2),
    [file.used, file.total]
  );

  return (
    <AccordionItem
      value={`item-${index}`}
      className="border rounded-lg px-4 bg-white shadow-sm"
    >
      <AccordionTrigger className="hover:no-underline py-4">
        <div className="flex justify-between items-center w-full pr-4">
          <p className="font-medium truncate max-w-2xl text-left">{file.url}</p>
          <div className="text-sm text-gray-600 ml-4">
            {file.used}/{file.total} bytes ({usagePercentage}%)
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="p-4 bg-gray-50 rounded-lg mt-2 border border-gray-200">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600">Total Bytes</p>
              <p className="text-lg font-semibold">{file.total}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600">Used Bytes</p>
              <p className="text-lg font-semibold">{file.used}</p>
            </div>
          </div>
          {file.unusedRules?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Unused Rules:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {file.unusedRules.map((rule, j) => (
                  <div
                    key={j}
                    className="text-sm p-2 bg-red-50 rounded border border-red-100"
                  >
                    <p className="text-red-600 truncate">{rule.selector}</p>
                    <p className="text-gray-500 text-xs">{rule.bytes} bytes</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export default function CSSChecker() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkCSS = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/check-css", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Failed to analyze CSS");

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  const exportToExcel = useCallback(() => {
    if (!result) return;

    const excelData = result.files.flatMap((file) => {
      const baseData = {
        "File URL": file.url,
        "Total Bytes": file.total,
        "Used Bytes": file.used,
        "Usage Percentage": `${((file.used / file.total) * 100).toFixed(2)}%`,
      };

      if (!file.unusedRules?.length) {
        return [baseData];
      }

      return file.unusedRules.map((rule) => ({
        ...baseData,
        "Unused Selector": rule.selector,
        "Unused Bytes": rule.bytes,
      }));
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CSS Analysis");
    XLSX.writeFile(wb, "css-analysis-report.xlsx");
  }, [result]);

  const stats = useMemo(() => {
    if (!result) return null;
    return {
      totalBytes: result.totalBytes,
      usedBytes: result.usedBytes,
      usagePercent: result.usagePercent.toFixed(2),
    };
  }, [result]);

  return (
    <>
      <Head>
        <title>CSS Checker</title>
      </Head>
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-bold text-center">CSS Usage Checker</h1>
        <Card>
          <CardContent className="p-4 space-y-4">
            <Input
              placeholder="Enter a website URL (e.g. https://example.com)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={checkCSS} disabled={loading || !url}>
                {loading ? (
                  <Loader2 className="animate-spin w-4 h-4" />
                ) : (
                  "Check CSS"
                )}
              </Button>
              {result && (
                <Button
                  onClick={exportToExcel}
                  variant="outline"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export to Excel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-red-500 text-center">{error}</p>}

        {result && stats && (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <StatsCard
                  label="Total CSS"
                  value={`${stats.totalBytes} bytes`}
                />
                <StatsCard
                  label="Used CSS"
                  value={`${stats.usedBytes} bytes`}
                />
                <StatsCard label="Usage" value={`${stats.usagePercent}%`} />
              </div>
              <div className="pt-4">
                <h2 className="text-lg font-semibold mb-4">File Details:</h2>
                <Accordion
                  type="single"
                  collapsible
                  className="w-full space-y-2"
                >
                  {result.files.map((file, i) => (
                    <FileDetails key={i} file={file} index={i} />
                  ))}
                </Accordion>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

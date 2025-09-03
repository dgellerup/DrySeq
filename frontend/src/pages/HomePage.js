import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext"; // assuming token there
import { API_BASE } from "../api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/ui/card";
import { Button } from "components/ui/button";
import { Badge } from "components/ui/badge";
import { Separator } from "components/ui/separator";
import { Activity, FileText, Binary, UploadCloud, Dna, Home as HomeIcon, Info, ChevronRight, RefreshCw } from "lucide-react";

export default function HomePage() {
    const { token } = useAuth();

    const [fastaFiles, setFastaFiles] = useState([]);
    const [fastqAnalyses, setFastqAnalyses] = useState([]);

    const fetchFastaFiles = async() => {
        try {
            const res = await fetch(`${API_BASE}/fasta-files`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setFastaFiles(data);
        } catch (err) {
            console.error("Failed to fetch FASTA files:", err);
        }
    };

    const fetchFastqAnalyses = async() => {
        try {
            const res = await fetch(`${API_BASE}/fastq-files`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setFastqAnalyses(data);
        } catch (err) {
             console.error("Failed to fetch FASTQ files:", err);
        }
    }

    useEffect(() => {
        if (!token) {
            setFastaFiles([]);
            setFastqAnalyses([]);
            return;
        }

        fetchFastaFiles();
        fetchFastqAnalyses();

        // const interval = setInterval(() => {
        //     fetchFastqAnalyses();
        // }, 15000);

        // return () => clearInterval(interval);
    }, [token]);


    return (
        <div className="mx-auto max-w-6xl p-6 space-y-8">
            <div className="flex items-start gap-3">
                <div>
                <h1 className="text-3xl font-semibold tracking-tight">Welcome to DrySeq</h1>
                <p className="text-muted-foreground mt-1">
                    DrySeq helps you validate primer products and generate mocked FASTQ files for testing.
                </p>
                </div>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Info className="h-5 w-5" /> How it works
                    </CardTitle>
                    <CardDescription>Three simple steps</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-3 gap-6 text-sm">
                    <div>
                        <div className="font-medium mb-1">1) Upload</div>
                        <p>Upload <strong>FASTA</strong> files (genomic/reference/primers) to your DrySeq account. Files are tracked in the DB and stored in S3 (auto-deleted after 7 days).</p>
                    </div>
                    <div>
                        <div className="font-medium mb-1">2) Run PCR</div>
                        <p>Pick <strong>genomic</strong> and <strong>primer</strong> files and launch PCR Analysis.</p>
                    </div>
                    <div>
                        <div className="font-medium mb-1">3) Generate FASTQs</div>
                        <p>Select a PCR product file to use as the basis for generating mocked FASTQ files.</p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UploadCloud className="h-5 w-5" /> Upload
                        </CardTitle>
                        <CardDescription>Send your files to DrySeq</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <p>
                            Select files for upload, designate a category, and DrySeq will handle storage + metadata.
                        </p>
                        <ul className="list-disc ml-5 space-y-1">
                            <li>Supports FASTA</li>
                            <li>Tag as <em>genomic</em> or <em>primer</em></li>
                            <li>Duplicate file detection</li>
                        </ul>
                        <div className="pt-2">
                            <Button asChild variant="outline">
                                <a href="/upload" className="inline-flex items-center">Go to Upload <ChevronRight className="h-4 w-4 ml-1" /></a>
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Dna className="h-5 w-5" /> PCR
                        </CardTitle>
                        <CardDescription>Run PCR Analysis</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <p>
                            Choose genomic and primers files and launch PCR Analysis.
                        </p>
                        <ul className="list-disc ml-5 space-y-1">
                            <li>Generates all possible PCR product amplicons combinatorically</li>
                            <li>Produces PCR FASTA file in your account for later use</li>
                        </ul>
                        <div className="pt-2">
                            <Button asChild variant="outline">
                                <a href="/pcr" className="inline-flex items-center">Go to PCR <ChevronRight className="h-4 w-4 ml-1" /></a>
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Binary className="h-5 w-5" /> FASTQ
                        </CardTitle>
                        <CardDescription>Generate Mock FASTQ Files</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <p>
                            Select a PCR Products FASTA file and launch FASTQ generation.
                        </p>
                        <ul className="list-disc ml-5 space-y-1">
                            <li>Pulls sequences from your PCR file randomly to create FASTQ reads</li>
                            <li>Uses <strong>documented quality score profiles</strong> to assign realistic qualities to base reads</li>
                            <li>Simulates template runoff when PCR products are shorter than sequencing read length</li>
                        </ul>
                        <div className="pt-2">
                            <Button asChild variant="outline">
                                <a href="/analyze" className="inline-flex items-center">Go to FASTQ <ChevronRight className="h-4 w-4 ml-1" /></a>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
import { useState, useEffect } from "react";
import { cmd } from "@/lib/commands";
import { SkillInfo } from "@/lib/commands";
import {
  Sparkles,
  Search,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Server,
  Folder,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface SkillSelectorProps {
  selectedSkills: SkillInfo[];
  onSkillsChange: (skills: SkillInfo[]) => void;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
}

export default function SkillSelector({
  selectedSkills,
  onSkillsChange,
  connectionStatus,
}: SkillSelectorProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "system" | "workspace">("all");
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    const doLoad = async () => {
      setLoading(true);
      setError(null);
      try {
        const installedSkills = await cmd.getInstalledSkills();
        if (!mounted) return;
        setSkills(installedSkills);
      } catch (err) {
        if (!mounted) return;
        setError("加载失败");
        console.error("Failed to load skills:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    doLoad();
    return () => { mounted = false; };
  }, []);

  const loadSkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const installedSkills = await cmd.getInstalledSkills();
      const skillsWithSelection = installedSkills.map((skill) => ({
        ...skill,
        enabled: selectedSkills.some((s) => s.name === skill.name),
      }));
      setSkills(skillsWithSelection);
    } catch (err) {
      setError("加载Skills失败");
      console.error("Failed to load skills:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSkill = (skillName: string) => {
    const updatedSkills = skills.map((skill) => {
      if (skill.name === skillName) {
        const newEnabled = !skill.enabled;
        onSkillsChange(
          newEnabled
            ? [...selectedSkills, { ...skill, enabled: true }]
            : selectedSkills.filter((s) => s.name !== skillName)
        );
        return { ...skill, enabled: newEnabled };
      }
      return skill;
    });
    setSkills(updatedSkills);
  };

  const toggleDescription = (skillName: string) => {
    const newExpanded = new Set(expandedDescriptions);
    if (newExpanded.has(skillName)) {
      newExpanded.delete(skillName);
    } else {
      newExpanded.add(skillName);
    }
    setExpandedDescriptions(newExpanded);
  };

  const filteredSkills = skills.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || skill.source === activeTab;
    return matchesSearch && matchesTab;
  });

  const systemSkillsCount = skills.filter((s) => s.source === "system").length;
  const workspaceSkillsCount = skills.filter((s) => s.source === "workspace").length;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-slate-500">加载中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center text-red-600">
            <X className="w-4 h-4" />
            <span className="ml-2 text-sm">{error}</span>
          </div>
          <button
            onClick={loadSkills}
            className="flex items-center px-3 py-1 text-xs text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="ml-1">重试</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="p-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-medium text-slate-700">Skills</h3>
            {connectionStatus === "connected" && (
              <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-600 rounded">
                已连接
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              已选 {selectedSkills.length}
            </span>
            <button
              onClick={loadSkills}
              className="p-1 text-slate-400 hover:text-slate-600"
              title="刷新"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="搜索Skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:border-purple-400"
          />
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 px-2 py-1 text-xs rounded ${
              activeTab === "all"
                ? "bg-purple-100 text-purple-600"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            全部 ({skills.length})
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`flex-1 px-2 py-1 text-xs rounded flex items-center justify-center gap-1 ${
              activeTab === "system"
                ? "bg-purple-100 text-purple-600"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Server className="w-3 h-3" />
            系统 ({systemSkillsCount})
          </button>
          <button
            onClick={() => setActiveTab("workspace")}
            className={`flex-1 px-2 py-1 text-xs rounded flex items-center justify-center gap-1 ${
              activeTab === "workspace"
                ? "bg-purple-100 text-purple-600"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Folder className="w-3 h-3" />
            工作区 ({workspaceSkillsCount})
          </button>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {filteredSkills.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-400">
            {searchQuery ? "没有找到匹配的Skill" : "没有安装的Skills"}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSkills.map((skill) => (
              <div
                key={skill.name}
                className={`p-2.5 transition-colors ${
                  skill.enabled ? "bg-purple-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => toggleSkill(skill.name)}
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      skill.enabled
                        ? "bg-purple-500 border-purple-500"
                        : "border-slate-300 hover:border-purple-400"
                    }`}
                  >
                    {skill.enabled && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-medium text-slate-700 truncate">
                        {skill.name}
                      </h4>
                      <button
                        onClick={() => toggleDescription(skill.name)}
                        className="p-0.5 text-slate-400 hover:text-slate-600"
                      >
                        {expandedDescriptions.has(skill.name) ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {skill.source === "system" ? (
                        <Server className="w-2.5 h-2.5 text-green-500" />
                      ) : (
                        <Folder className="w-2.5 h-2.5 text-blue-500" />
                      )}
                      <span className="text-xs text-slate-400">{skill.source === "system" ? "系统" : "工作区"}</span>
                    </div>
                    {expandedDescriptions.has(skill.name) && (
                      <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                        {skill.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

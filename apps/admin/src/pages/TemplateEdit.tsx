import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Upload,
  message,
} from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import type { UploadFile, UploadProps } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import {
  CategoryItem,
  NetdiskType,
  TagItem,
  TemplateItem,
  UploadResult,
  FORMAT_OPTIONS,
} from '../types';

interface FileRow {
  key: number;
  filename: string;
  netdiskType: NetdiskType;
  shareUrl: string;
}

let fileKeySeq = 1;

interface AiSuggestion {
  title: string;
  summary: string;
  categoryIds: number[];
  tagIds: number[];
  suggestedPrice: number;
}

export function TemplateEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = id !== undefined;

  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [coverList, setCoverList] = useState<UploadFile[]>([]);
  const [previewList, setPreviewList] = useState<UploadFile[]>([]);
  const [files, setFiles] = useState<FileRow[]>([
    { key: 0, filename: '', netdiskType: 'quark', shareUrl: '' },
  ]);

  useEffect(() => {
    void (async () => {
      try {
        const [cats, tgs] = await Promise.all([
          api.get<CategoryItem[]>('/admin/categories'),
          api.get<TagItem[]>('/admin/tags?pageSize=100'),
        ]);
        setCategories(cats);
        setTags(tgs);
      } catch (e) {
        message.error(e instanceof Error ? e.message : '分类/标签加载失败');
      }
    })();
  }, []);

  useEffect(() => {
    if (!editing) return;
    void (async () => {
      try {
        const t = await api.get<TemplateItem>(`/admin/templates/${id}`);
        form.setFieldsValue({
          title: t.title,
          summary: t.summary,
          format: t.format,
          baseCreditPrice: t.baseCreditPrice,
          copyrightSource: t.copyrightSource,
          authorizationNote: t.authorizationNote,
          categoryIds: t.categories.map((c) => c.category.id),
          tagIds: t.tags.map((x) => x.tag.id),
        });
        if (t.cover) setCoverList([{ uid: 'cover', name: 'cover.webp', status: 'done', url: t.cover }]);
        if (t.previews?.length) {
          setPreviewList(
            t.previews.map((u, i) => ({ uid: `p${i}`, name: `preview${i}.webp`, status: 'done', url: u })),
          );
        }
        if (t.files?.length) {
          setFiles(
            t.files.map((f) => ({
              key: fileKeySeq++,
              filename: f.filename,
              netdiskType: f.netdiskType,
              shareUrl: f.shareUrl ?? '',
            })),
          );
        }
      } catch (e) {
        message.error(e instanceof Error ? e.message : '模板加载失败');
      }
    })();
  }, [editing, id, form]);

  async function customUpload(file: File, onDone: (url: string) => void) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.upload('/admin/uploads/image', fd) as unknown as UploadResult;
      onDone(res.url);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '上传失败');
      throw e;
    }
  }

  type CustomReq = NonNullable<UploadProps['customRequest']>;

  const coverUpload = {
    maxCount: 1,
    accept: 'image/*',
    customRequest: ((opts) => {
      customUpload(opts.file as File, (url) => {
        form.setFieldValue('cover', url);
        opts.onSuccess?.(opts.file as never);
      }).catch((e) => opts.onError?.(e as Error));
    }) as CustomReq,
    onChange: ({ fileList }: { fileList: UploadFile[] }) => setCoverList(fileList.slice(-1)),
    onRemove: () => form.setFieldValue('cover', undefined),
  };

  const previewUpload = {
    multiple: true,
    accept: 'image/*',
    customRequest: ((opts) => {
      customUpload(opts.file as File, (url) => {
        const prev = (form.getFieldValue('previews') as string[]) ?? [];
        form.setFieldValue('previews', [...prev, url]);
        opts.onSuccess?.(opts.file as never);
      }).catch((e) => opts.onError?.(e as Error));
    }) as CustomReq,
    onChange: ({ fileList }: { fileList: UploadFile[] }) => setPreviewList(fileList.slice(0, 5)),
    onRemove: (f: UploadFile) => {
      const prev = (form.getFieldValue('previews') as string[]) ?? [];
      const idx = previewList.findIndex((x) => x.uid === f.uid);
      if (idx >= 0 && prev[idx]) {
        prev.splice(idx, 1);
        form.setFieldValue('previews', prev);
      }
    },
  };

  async function onSave(values: Record<string, unknown>) {
    const validFiles = files.filter((f) => f.filename && f.shareUrl);
    if (validFiles.length === 0) {
      message.warning('至少填写一个完整的网盘文件（文件名 + 分享链接）');
      return;
    }
    const dims = ['format', 'scene', 'audience', 'theme'] as const;
    const categoryIds = dims.flatMap((dim) => ((values[`cat_${dim}`] as number[]) ?? []));
    if (categoryIds.length === 0) {
      message.warning('至少选择一个分类');
      return;
    }
    const { cat_format: _f, cat_scene: _s, cat_audience: _a, cat_theme: _t, ...rest } = values;
    const payload = {
      ...rest,
      categoryIds,
      cover: (form.getFieldValue('cover') as string) || undefined,
      previews: (form.getFieldValue('previews') as string[]) ?? [],
      files: validFiles.map((f) => ({
        filename: f.filename,
        netdiskType: f.netdiskType,
        shareUrl: f.shareUrl,
      })),
    };
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/admin/templates/${id}`, payload);
        message.success('已保存');
      } else {
        await api.post('/admin/templates', payload);
        message.success('已创建草稿');
      }
      navigate('/admin/templates');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const [aiLoading, setAiLoading] = useState(false);

  async function onAiEnrich() {
    setAiLoading(true);
    try {
      const res = await api.post<{ applied: boolean; suggestion: AiSuggestion }>(
        `/admin/templates/${id}/ai-enrich`,
        { apply: false },
      );
      const s = res.suggestion;
      form.setFieldsValue({
        title: s.title,
        summary: s.summary,
        baseCreditPrice: s.suggestedPrice,
        cat_format: s.categoryIds.filter((cid) =>
          categories.some((c) => c.id === cid && c.dimension === 'format'),
        ),
        cat_scene: s.categoryIds.filter((cid) =>
          categories.some((c) => c.id === cid && c.dimension === 'scene'),
        ),
        cat_audience: s.categoryIds.filter((cid) =>
          categories.some((c) => c.id === cid && c.dimension === 'audience'),
        ),
        cat_theme: s.categoryIds.filter((cid) =>
          categories.some((c) => c.id === cid && c.dimension === 'theme'),
        ),
        tagIds: s.tagIds,
      });
      message.success('AI 建议已填充到表单，请人工确认后保存');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'AI 补全失败');
    } finally {
      setAiLoading(false);
    }
  }

  const dims = ['format', 'scene', 'audience', 'theme'] as const;
  const dimLabel: Record<string, string> = {
    format: '格式',
    scene: '场景',
    audience: '人群',
    theme: '主题',
  };

  return (
    <Form form={form} layout="vertical" onFinish={onSave} style={{ maxWidth: 960 }}>
      <Card title={editing ? `编辑模板 #${id}` : '新建模板'}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="标题"
              name="title"
              rules={[{ required: true, message: '请输入标题' }, { max: 128 }]}
            >
              <Input placeholder="模板标题" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="格式" name="format" rules={[{ required: true, message: '请选择格式' }]}>
              <Select options={FORMAT_OPTIONS} placeholder="选择格式" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              label="积分价"
              name="baseCreditPrice"
              initialValue={0}
              rules={[{ required: true }]}
              extra="0 = 免费"
            >
              <InputNumber min={0} max={10000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="摘要" name="summary" rules={[{ max: 512 }]}>
          <Input.TextArea rows={2} placeholder="模板简介（小程序列表展示用）" />
        </Form.Item>

        <Divider orientation="left">图片素材</Divider>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item label="封面图（1 张，webp 自动转换）" name="cover">
              <Upload listType="picture-card" {...coverUpload}>
                {coverList.length === 0 && (
                  <div>
                    <Plus />
                    <div style={{ marginTop: 4, fontSize: 12 }}>封面</div>
                  </div>
                )}
              </Upload>
            </Form.Item>
          </Col>
          <Col span={18}>
            <Form.Item
              label="预览截图（最多 5 张）"
              name="previews"
              extra="点击卡片上传；替代旧版文档在线预览方案"
            >
              <Upload listType="picture-card" {...previewUpload}>
                {previewList.length < 5 && (
                  <div>
                    <Plus />
                    <div style={{ marginTop: 4, fontSize: 12 }}>上传</div>
                  </div>
                )}
              </Upload>
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left">分类与标签</Divider>
        {dims.map((dim) => (
          <Form.Item
            key={dim}
            label={`${dimLabel[dim]}分类（可多选）`}
            name={`cat_${dim}`}
            rules={
              dim === 'format'
                ? [{ required: true, message: '至少选择一个格式分类' }]
                : undefined
            }
          >
            <Select
              mode="multiple"
              allowClear
              maxCount={3}
              placeholder={`选择${dimLabel[dim]}分类（每维最多 3 个）`}
              options={categories
                .filter((c) => c.dimension === dim && c.parentId !== null)
                .map((c) => ({ value: c.id, label: c.parent ? `${c.parent.name} / ${c.name}` : c.name }))}
            />
          </Form.Item>
        ))}
        <Form.Item label="标签（最多 10 个）" name="tagIds">
          <Select mode="multiple" allowClear maxCount={10} placeholder="选择标签" options={tags.map((t) => ({ value: t.id, label: t.name }))} />
        </Form.Item>

        <Divider orientation="left">网盘文件（夸克 / 百度分享链接）</Divider>
        {files.map((f, i) => (
          <Row key={f.key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
            <Col span={7}>
              <Input
                placeholder="文件名，如 简历模板A.pptx"
                value={f.filename}
                onChange={(e) => {
                  const next = [...files];
                  next[i] = { ...f, filename: e.target.value };
                  setFiles(next);
                }}
              />
            </Col>
            <Col span={4}>
              <Select
                style={{ width: '100%' }}
                value={f.netdiskType}
                options={[
                  { value: 'quark', label: '夸克网盘' },
                  { value: 'baidu', label: '百度网盘' },
                ]}
                onChange={(v) => {
                  const next = [...files];
                  next[i] = { ...f, netdiskType: v as NetdiskType };
                  setFiles(next);
                }}
              />
            </Col>
            <Col span={11}>
              <Input
                placeholder="分享链接（含提取码）"
                value={f.shareUrl}
                onChange={(e) => {
                  const next = [...files];
                  next[i] = { ...f, shareUrl: e.target.value };
                  setFiles(next);
                }}
              />
            </Col>
            <Col span={2}>
              <Button
                type="text"
                danger
                icon={<Trash2 size={14} />}
                disabled={files.length === 1}
                onClick={() => setFiles(files.filter((x) => x.key !== f.key))}
              />
            </Col>
          </Row>
        ))}
        <Button
          icon={<Plus />}
          disabled={files.length >= 10}
          onClick={() => setFiles([...files, { key: fileKeySeq++, filename: '', netdiskType: 'quark', shareUrl: '' }])}
        >
          添加文件
        </Button>

        <Divider orientation="left">版权信息（可选）</Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="来源说明" name="copyrightSource" rules={[{ max: 256 }]}>
              <Input placeholder="如：原创自制" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="授权说明" name="authorizationNote" rules={[{ max: 512 }]}>
              <Input placeholder="如：已获作者授权" />
            </Form.Item>
          </Col>
        </Row>
      </Card>
      <Space style={{ marginTop: 16 }}>
        <Button type="primary" htmlType="submit" loading={saving}>
          {editing ? '保存' : '创建草稿'}
        </Button>
        {editing && (
          <Button onClick={onAiEnrich} loading={aiLoading}>
            AI 补全
          </Button>
        )}
        <Button onClick={() => navigate('/admin/templates')}>取消</Button>
      </Space>
    </Form>
  );
}

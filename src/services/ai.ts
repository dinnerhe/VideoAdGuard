export class AIService {
  private static async makeRequest(videoInfo: any, config: {
    headers: Record<string, string>,
    bodyExtra?: Record<string, any>
  }) {
    const messageBody = {
      model: await this.getModel(),
      messages: [
        {
          role: "system",
          content:
            "你是一个敏感的视频观看者，能根据视频的连贯性改变和宣传推销类内容，找出视频中可能存在的植入广告。内容如果和主题相关，即使是推荐/评价也可能只是分享而不是广告，重点要看有没有提到通过视频博主可以受益的渠道进行购买。",
        },
        {
          role: "user",
          content: this.buildPrompt(videoInfo),
        },
      ],
      temperature: 0,
      max_tokens: 1024,
      stream: false,
      ...config.bodyExtra,
    };

    const response = await chrome.runtime.sendMessage({
      url: await this.getApiUrl(),
      headers: config.headers,
      body: messageBody,
    });

    console.log("【VideoAdGuard】API请求已发送");
    if (response.success) {
      console.log("【VideoAdGuard】收到API响应:", response.data);
      return response.data;
    } else {
      console.error("【VideoAdGuard】请求失败:", response.error);
      throw new Error(response.error);
    }
  }

  public static async detectAd(videoInfo: {
    title: string;
    topComment: string | null;
    captions: Record<number, string>;
  }) {
    console.log("【VideoAdGuard】开始分析视频信息:", videoInfo);
    const enableLocalOllama = await this.getEnableLocalOllama();

    if (enableLocalOllama) {
      const data = await this.makeRequest(videoInfo, {
        headers: {
          "Content-Type": "application/json",
        },
        bodyExtra: {
          format: "json",
        }
      });
      return JSON.parse(data.message.content);
    } else {
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        throw new Error("未设置API密钥");
      }
      console.log("【VideoAdGuard】成功获取API密钥");
      
      const url = await this.getApiUrl();
      const model = await this.getModel();
      const isOpenAI = url.includes("api.openai.com");
      const isAzureOpenAI = url.includes("openai.azure.com");
      const isZhipuAI = url.includes("open.bigmodel.cn");
      const isDeepseek = url.includes("api.deepseek.com");
      const isQwen = url.includes("aliyuncs.com");

      const bodyExtra: any = {};

      // 仅对支持 JSON 模式的模型添加 response_format
      if (isOpenAI || isAzureOpenAI || isZhipuAI || isDeepseek || isQwen) {
        bodyExtra.response_format = { type: "json_object" };
      }

      const data = await this.makeRequest(videoInfo, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        bodyExtra: Object.keys(bodyExtra).length ? bodyExtra : undefined,
      });
      return data.choices[0].message.content;
    }
  }
  
  private static buildPrompt(videoInfo: {
    title: string;
    topComment: string | null;
    captions: Record<number, string>;
  }): string {
    const prompt = `视频的标题和置顶评论如下，可供参考判断是否有植入广告。如果置顶评论中有购买链接，则肯定有广告，同时可以根据置顶评论的内容判断视频中的广告商从而确定哪部分是广告。
视频标题：${videoInfo.title}
置顶评论：${videoInfo.topComment || '无'}
下面我会给你这个视频的字幕字典，形式为 index: context. 请你完整地找出其中的植入广告，返回json格式的数据。注意要返回一整段的广告，从广告的引入到结尾重新转折回到视频内容前，因此不要返回太短的广告，可以组合成一整段返回。
字幕内容：${JSON.stringify(videoInfo.captions)}
示例输出：
{
  "exist": <bool. true表示存在植入广告，false表示不存在植入广告>,
  "index_lists": <list[list[int]]. 二维数组，行数表示广告的段数，不要返回过多段，只返回与标题最不相关或者与置顶链接中的商品最相关的部分。每一行是长度为2的数组[start, end]，表示一段完整广告的开头结尾，start和end是字幕的index。>
}`;
    console.log('【VideoAdGuard】构建提示词成功:', prompt);
    return prompt;
  }

  private static async getApiUrl(): Promise<string> {
    console.log('【VideoAdGuard】正在获取API地址');
    const result = await chrome.storage.local.get('apiUrl');
    console.log('【VideoAdGuard】API地址状态:', result.apiUrl? '已设置' : '未设置');
    return result.apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  }

  private static async getApiKey(): Promise<string | null> {
    console.log('【VideoAdGuard】正在获取API密钥');
    const result = await chrome.storage.local.get('apiKey');
    console.log('【VideoAdGuard】API密钥状态:', result.apiKey ? '已设置' : '未设置');
    return result.apiKey || null;
  }

  private static async getModel(): Promise<string | null> {
    console.log('【VideoAdGuard】正在获取模型名称');
    const result = await chrome.storage.local.get('model');
    console.log('【VideoAdGuard】模型名称状态:', result.model ? '已设置' : '未设置');
    return result.model || 'glm-4-flash';
  }

  private static async getEnableLocalOllama(): Promise<boolean> {
    console.log("【VideoAdGuard】正在获取本地Ollama设置");
    const result = await chrome.storage.local.get("enableLocalOllama");
    console.log(
      "【VideoAdGuard】本地Ollama设置状态:",
      result.enableLocalOllama ? "已设置" : "未设置"
    );
    return result.enableLocalOllama || false;
  }
}

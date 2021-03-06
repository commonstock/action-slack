import * as core from '@actions/core';
import * as github from '@actions/github';
import { IncomingWebhook, IncomingWebhookSendArguments } from '@slack/webhook';

export interface With {
  status: string;
  mention: string;
  only_mention_fail: string;
  username: string;
  icon_emoji: string;
  icon_url: string;
  channel: string;
}

const groupMention = ['here', 'channel'];

export class Client {
  private webhook: IncomingWebhook;
  private github?: github.GitHub;
  private with: With;

  constructor(props: With, token?: string, webhookUrl?: string) {
    this.with = props;

    if (props.status !== 'custom') {
      if (token === undefined) {
        throw new Error('Specify secrets.GITHUB_TOKEN');
      }
      this.github = new github.GitHub(token);
    }

    if (webhookUrl === undefined) {
      throw new Error('Specify secrets.SLACK_WEBHOOK_URL');
    }
    this.webhook = new IncomingWebhook(webhookUrl);
  }

  async success(text?: string) {
    const template = await this.payloadTemplate();
    template.attachments[0].color = 'good';
    // template.text += ':white_check_mark: Succeeded GitHub Actions\n';
    template.text += text;
    return template;
  }

  async fail(text?: string) {
    const template = await this.payloadTemplate();
    template.attachments[0].color = 'danger';
    template.text += this.mentionText(this.with.only_mention_fail);
    // template.text += ':no_entry: Failed GitHub Actions\n';
    template.text += text || '';
    return template;
  }

  async cancel(text?: string) {
    const template = await this.payloadTemplate();
    template.attachments[0].color = 'warning';
    // template.text += ':warning: Canceled GitHub Actions\n';
    template.text += text;

    return template;
  }

  async send(payload: string | IncomingWebhookSendArguments) {
    core.debug(JSON.stringify(github.context, null, 2));
    await this.webhook.send(payload);
    core.debug('send message');
  }

  private async payloadTemplate() {
    const text = this.mentionText(this.with.mention);
    const { username, icon_emoji, icon_url, channel } = this.with;

    return {
      text,
      username,
      icon_emoji,
      icon_url,
      channel,
      attachments: [
        {
          color: '',
          fields: await this.fields(),
        },
      ],
    };
  }

  private async fields() {
    if (this.github === undefined) {
      throw Error('Specify secrets.GITHUB_TOKEN');
    }
    const { sha } = github.context;
    const { owner, repo } = github.context.repo;
    const commit = await this.github.repos.getCommit({ owner, repo, ref: sha });
    const { author } = commit.data.commit;

    return [
      this.repo,
      {
        title: 'message',
        value: commit.data.commit.message,
        short: false,
      },
      {
        title: 'author',
        value: `${author.name}<${author.email}>`,
        short: true,
      },
      this.eventName,
      this.ref,
    ];
  }

  private get commit() {
    return {
      title: 'commit',
      value: ``,
      short: true,
    };
  }

  private get repo() {
    const { sha } = github.context;
    const { owner, repo } = github.context.repo;
    const value = `
workflow: ${github.context.workflow}
action: <https://github.com/${owner}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}|actions/runs/${process.env.GITHUB_RUN_ID}>
repo: <https://github.com/${owner}/${repo}|${owner}/${repo}>
commit: <https://github.com/${owner}/${repo}/commit/${sha}|${sha}>
`;
    return {
      title: '',
      value,
      short: false,
    };
  }

  private get eventName() {
    return {
      title: 'eventName',
      value: github.context.eventName,
      short: true,
    };
  }

  private get ref() {
    return { title: 'ref', value: github.context.ref, short: true };
  }

  private mentionText(mention: string) {
    const normalized = mention.replace(/ /g, '');
    if (groupMention.includes(normalized)) {
      return `<!${normalized}> `;
    } else if (normalized !== '') {
      const text = normalized
        .split(',')
        .map(userId => `<@${userId}>`)
        .join(' ');
      return `${text} `;
    }
    return '';
  }
}

# numberbarn2telegram

这是一个cloudflare email workers,能够将numberbarn的短信邮件转换成telegram消息。

![](example.png)

### 项目来源

作为Google Voice的老用户，时常担心自己的号码被回收。Google的政策实在是很迷惑，最近有认识的人在没有预警的情况下号码被回收了。所以想把号码转出去，但是实体卡担心SIM卡损坏补卡的问题，esim的话还得另外买一部平时用不上的手机。

最后选择号码转到了numberbarn，这也是一个类似google voice的平台但是不是免费的。从Google Voice转出需要3U的解锁费用，然后numberbarn转入需要收取5U的一个费用，然后他们家最低的保号套餐是2U一个月。有一说一还是挺贵的。PS：现在google voice不支持虚拟号转入，所以你转到numberbarn后想回去是不行的，必须借助一张实体卡中转。

但是numberbarn的网站和APP都太复古了，实在是不想用。连邮件也是丑丑的不想打开。这个号码基本只是收验证码，没有发短信或者接打电话的需求。所以我可以跟简单的借助Cloudflare推出的[`Email Routing`](https://developers.cloudflare.com/email-routing/), 我可以很简单的对邮件进行读取之后转发到telegram里。

### 部署

```shell
git clone git@github.com:TBXark/numberbarn2telegram.git
# 复制配置模板，修改成自己的telegram配置
cp wrangler.example.toml wrangler.toml 
yarn & yarn build & yarn pub
```

